import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { buildNotificationEmail, buildPushMessage, buildSmsMessage, SMS_ENABLED_TYPES, sendEmail, type NotifyType, type NotifyJobInfo } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { sendSms } from '@/lib/sms'
import { notifyMatchingContractors } from '@/lib/openJobAlerts'

type Role = 'landlord' | 'renter' | 'contractor'

const RECIPIENTS: Record<NotifyType, Role[]> = {
  job_reported: ['landlord'],
  bid_received: ['landlord'],
  contractor_selected: ['contractor'],
  schedule_proposed: ['landlord', 'renter', 'contractor'],
  schedule_confirmed: ['landlord', 'renter', 'contractor'],
  job_pending_review: ['landlord'],
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
  // the landlord, the tenant (or a co-renter), or a contractor who bid on it.
  const isLandlord = property?.owner_user_id === user.id
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
  }

  console.log('notify: resolved job/property', { jobId, type, units: job.units, property })

  const roles = RECIPIENTS[type].filter((r) => r !== excludeRole)
  const roleUserIds: Partial<Record<Role, string>> = {}

  if (roles.includes('landlord') && property?.owner_user_id) {
    roleUserIds.landlord = property.owner_user_id
  }

  if (roles.includes('renter')) {
    const { data: tenancy } = await supabaseAdmin
      .from('tenancies')
      .select('renter_user_id')
      .eq('unit_id', job.unit_id)
      .eq('ended', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (tenancy?.renter_user_id) roleUserIds.renter = tenancy.renter_user_id
  }

  if (roles.includes('contractor')) {
    const { data: bid } = await supabaseAdmin
      .from('bids')
      .select('contractor_user_id')
      .eq('job_id', jobId)
      .eq('status', 'accepted')
      .maybeSingle()
    if (bid?.contractor_user_id) roleUserIds.contractor = bid.contractor_user_id
  }

  console.log('notify: recipients to notify', { jobId, type, roleUserIds })

  const sends = await Promise.allSettled(
    (Object.entries(roleUserIds) as [Role, string][]).map(async ([role, userId]) => {
      const { data: recipient, error: recipientError } = await supabaseAdmin
        .from('users')
        .select('email, phone, sms_opt_in')
        .eq('id', userId)
        .maybeSingle()

      if (recipientError) {
        console.error('notify: error fetching recipient', { jobId, role, userId, recipientError })
      }

      if (!recipient?.email) {
        console.error('notify: no email found for recipient', { jobId, role, userId })
        return
      }

      const { subject, html } = buildNotificationEmail(type, role, jobInfo)
      const result = await sendEmail({ to: recipient.email, subject, html })
      console.log('notify: sendEmail result', { jobId, role, to: recipient.email, result })

      const push = buildPushMessage(type, role, jobInfo)
      await sendPush(userId, push).catch((err) => console.error('notify: sendPush failed', { jobId, role, err }))

      const smsAllowedForType = SMS_ENABLED_TYPES.includes(type) && (type !== 'job_reported' || jobInfo.isEmergency)
      if (smsAllowedForType && recipient.sms_opt_in && recipient.phone) {
        await sendSms(recipient.phone, buildSmsMessage(type, jobInfo)).catch((err) =>
          console.error('notify: sendSms failed', { jobId, role, err })
        )
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
