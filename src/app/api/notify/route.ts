import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { buildNotificationEmail, sendEmail, type NotifyType, type NotifyJobInfo } from '@/lib/email'

type Role = 'landlord' | 'renter' | 'contractor'

const RECIPIENTS: Record<NotifyType, Role[]> = {
  job_reported: ['landlord'],
  bid_received: ['landlord'],
  contractor_selected: ['contractor'],
  schedule_confirmed: ['landlord', 'renter', 'contractor'],
  job_pending_review: ['landlord'],
  job_completed: ['renter', 'contractor'],
}

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { type, jobId } = (await request.json()) as { type?: NotifyType; jobId?: string }
  if (!type || !jobId || !RECIPIENTS[type]) {
    return NextResponse.json({ error: 'Invalid notification request' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('id, category, unit_id, units(property_id, properties(address, city, owner_user_id))')
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
  const jobInfo: NotifyJobInfo = {
    jobId: job.id,
    category: job.category,
    address: property?.address ?? null,
    city: property?.city ?? null,
  }

  console.log('notify: resolved job/property', { jobId, type, units: job.units, property })

  const roles = RECIPIENTS[type]
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
        .select('email')
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
    })
  )

  sends.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('Notification send failed:', result.reason)
    }
  })

  return NextResponse.json({ ok: true })
}
