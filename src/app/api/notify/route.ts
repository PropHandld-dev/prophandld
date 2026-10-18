import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { buildNotificationEmail, buildPushMessage, buildSmsMessage, SMS_ENABLED_TYPES, sendEmail, type NotifyType, type NotifyJobInfo, type Lang } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { sendAlertSms } from '@/lib/sms'
import { notifyMatchingContractors } from '@/lib/openJobAlerts'
import { loadNotifyExtras } from '@/lib/notifyExtras'
import { emailAllowed } from '@/lib/notificationPrefs'
import { notifyLandlordIds } from '@/lib/landlordCoOwners'
import { notifyRenterIds } from '@/lib/coRenters'

type Role = 'landlord' | 'renter' | 'contractor'

const RECIPIENTS: Record<NotifyType, Role[]> = {
  job_reported: ['landlord'],
  bid_received: ['landlord'],
  contractor_selected: ['contractor'],
  schedule_proposed: ['landlord', 'renter', 'contractor'],
  schedule_confirmed: ['landlord', 'renter', 'contractor'],
  job_started: ['landlord', 'renter'],
  job_pending_review: ['landlord', 'renter'],
  job_completed: ['renter', 'contractor'],
  job_declined: ['renter'],
  price_change_requested: ['landlord'],
  price_change_approved: ['contractor'],
  price_change_rejected: ['contractor'],
  clarification_requested: ['contractor'],
  clarification_responded: ['landlord'],
  contractor_cancelled: ['landlord', 'renter'],
  // Handled separately: goes to matching contractors, not to people on the job.
  job_open: ['contractor'],
}

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { type, jobId, excludeRole } = (await request.json()) as { type?: NotifyType; jobId?: string; excludeRole?: Role }
  if (!type || !jobId || !RECIPIENTS[type]) {
    return NextResponse.json({ error: 'Invalid notification request' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('id, status, category, unit_id, is_emergency, units(property_id, properties(address, city, owner_user_id))')
    .eq('id', jobId)
    .maybeSingle()

  if (jobError) {
    console.error('notify: error fetching job', { jobId, type, jobError })
  }

  if (!job) {
    console.error('notify: job not found', { jobId, type })
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const property = (job.units as any)?.properties

  // Only people who are part of this job may trigger notifications about it:
  // the landlord (or an accepted co-owner), the tenant (or a co-renter), or
  // a contractor who bid on it. Fetched once here and reused below as the
  // landlord recipient list — a co-owner acting on a shared property was
  // previously blocked outright (owner_user_id match only), and even a
  // genuine primary-owner action only ever notified themselves, never a
  // co-owner who's supposed to have full access to the same jobs.
  const landlordIds = property?.owner_user_id ? await notifyLandlordIds(supabaseAdmin, property.owner_user_id) : []
  const isLandlord = landlordIds.includes(user.id)
  let allowed = isLandlord
  if (!allowed) {
    const { data: tenancies } = await supabaseAdmin.from('tenancies').select('id, renter_user_id').eq('unit_id', job.unit_id)
    const rows = tenancies || []
    allowed = rows.some((t: any) => t.renter_user_id === user.id)
    if (!allowed && rows.length > 0) {
      const { data: occupant } = await supabaseAdmin
        .from('tenancy_occupants')
        .select('id')
        .eq('renter_user_id', user.id)
        .in('tenancy_id', rows.map((t: any) => t.id))
        .limit(1)
        .maybeSingle()
      allowed = !!occupant
    }
  }
  if (!allowed) {
    const { data: ownBid } = await supabaseAdmin
      .from('bids')
      .select('id')
      .eq('job_id', jobId)
      .eq('contractor_user_id', user.id)
      .limit(1)
      .maybeSingle()
    allowed = !!ownBid
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // "New job near you" goes to matching contractors, and only once the
  // landlord has opened the job for bidding.
  if (type === 'job_open') {
    if (!isLandlord) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    const result = await notifyMatchingContractors(supabaseAdmin, jobId)
    return NextResponse.json({ ok: true, ...result })
  }

  const jobInfo: NotifyJobInfo = {
    jobId: job.id,
    category: job.category,
    address: property?.address ?? null,
    city: property?.city ?? null,
    isEmergency: job.is_emergency ?? false,
    ...(await loadNotifyExtras(supabaseAdmin, jobId)),
  }

  const roles = RECIPIENTS[type].filter((r) => r !== excludeRole)
  const roleUserIds: Partial<Record<Role, string[]>> = {}

  // landlordIds already includes any accepted co-owner (computed above for
  // the auth check) — reused here so co-owners get the same job
  // notifications the primary does, not just read access to the job itself.
  if (roles.includes('landlord') && landlordIds.length > 0) {
    roleUserIds.landlord = landlordIds
  }

  if (roles.includes('renter')) {
    const { data: tenancy } = await supabaseAdmin
      .from('tenancies')
      .select('id, renter_user_id')
      .eq('unit_id', job.unit_id)
      .eq('ended', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (tenancy?.renter_user_id) {
      roleUserIds.renter = await notifyRenterIds(supabaseAdmin, tenancy.id, tenancy.renter_user_id)
    }
  }

  if (roles.includes('contractor')) {
    const { data: bid } = await supabaseAdmin
      .from('bids')
      .select('contractor_user_id')
      .eq('job_id', jobId)
      .eq('status', 'accepted')
      .maybeSingle()
    if (bid?.contractor_user_id) roleUserIds.contractor = [bid.contractor_user_id]
  }

  const sendTargets = (Object.entries(roleUserIds) as [Role, string[]][]).flatMap(([role, userIds]) =>
    userIds.map((userId) => ({ role, userId }))
  )

  const sends = await Promise.allSettled(
    sendTargets.map(async ({ role, userId }) => {
      const { data: recipient, error: recipientError } = await supabaseAdmin
        .from('users')
        .select('email, phone, sms_opt_in, preferred_language, email_notifications_enabled')
        .eq('id', userId)
        .maybeSingle()

      if (recipientError) {
        console.error('notify: error fetching recipient', { jobId, role, userId, recipientError })
      }

      if (!recipient?.email) {
        console.error('notify: no email found for recipient', { jobId, role, userId })
        return
      }

      const lang: Lang = recipient.preferred_language === 'es' ? 'es' : 'en'
      if (emailAllowed(recipient)) {
        const { subject, html } = buildNotificationEmail(type, role, jobInfo, lang)
        const result = await sendEmail({ to: recipient.email, subject, html })
        if (!result.ok) console.error('notify: sendEmail failed', { jobId, role, type })
      }

      const push = buildPushMessage(type, role, jobInfo)
      await sendPush(userId, push).catch((err) => console.error('notify: sendPush failed', { jobId, role, err }))

      // job_reported used to only text for emergencies, on a volume
      // concern (a landlord with several units could get a report several
      // times a month, most of them routine) — but SMS is opt-in per
      // landlord already, and the explicit decision is that opting in
      // means every report, not just emergencies. buildSmsMessage()
      // already reads fine either way (pushCopy only adds an "Emergency:"
      // prefix when info.isEmergency is actually true).
      const smsAllowedForType = SMS_ENABLED_TYPES.includes(type)
      if (smsAllowedForType && recipient.sms_opt_in && recipient.phone) {
        const smsResult = await sendAlertSms(recipient.phone, buildSmsMessage(type, role, jobInfo)).catch((err) => {
          console.error('notify: sendSms failed', { jobId, role, err })
          return null
        })
        if (smsResult?.ok) {
          await supabaseAdmin.from('notification_log').insert({
            notification_type: type,
            channel: 'sms',
            recipient_user_id: userId,
            external_id: smsResult.id || null,
            resource_type: 'job',
            resource_id: jobId,
          })
        }
      }
    })
  )

  sends.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('Notification send failed:', result.reason)
    }
  })

  return NextResponse.json({ ok: true })
}
