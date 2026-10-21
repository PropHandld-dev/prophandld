import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { logAdminAudit } from '@/lib/auditLog'
import { sendDisputeResolvedEmail } from '@/lib/email'
import { emailAllowed } from '@/lib/notificationPrefs'
import { sendPush } from '@/lib/push'
import { notifyLandlordIds } from '@/lib/landlordCoOwners'
import { resolveReportingRenterIds } from '@/lib/resolveReportingTenancy'

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { disputeId, outcome, resolutionNotes } = (await request.json()) as {
    disputeId?: string
    outcome?: 'landlord' | 'contractor' | 'other'
    resolutionNotes?: string | null
  }
  if (!disputeId || !outcome) {
    return NextResponse.json({ error: 'Missing disputeId or outcome' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: dispute, error: disputeError } = await supabaseAdmin
    .from('disputes')
    .select('job_id')
    .eq('id', disputeId)
    .maybeSingle()

  if (disputeError || !dispute) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('disputes')
    .update({
      status: 'resolved',
      outcome,
      resolution_notes: resolutionNotes || null,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', disputeId)

  if (updateError) {
    console.error('disputes/resolve: error updating dispute', updateError)
    return NextResponse.json({ error: 'Could not resolve dispute' }, { status: 500 })
  }

  await logAdminAudit({
    actionType: 'dispute_resolved',
    actorUserId: user.id,
    actorEmail: user.email,
    detail: { disputeId, jobId: dispute.job_id, outcome },
  })

  const { error: jobUpdateError } = await supabaseAdmin
    .from('jobs')
    .update({ status: 'completed' })
    .eq('id', dispute.job_id)

  if (jobUpdateError) {
    console.error('disputes/resolve: error reverting job status', jobUpdateError)
  }

  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('category, unit_id, reported_by, units(properties(address, owner_user_id))')
    .eq('id', dispute.job_id)
    .maybeSingle()

  const property = (job?.units as any)?.properties
  const propertyLabel = property?.address || 'the property'
  const jobCategory = job?.category || 'the job'

  const recipients: { userId: string; role: 'landlord' | 'renter' | 'contractor' }[] = []
  if (property?.owner_user_id) {
    const landlordIds = await notifyLandlordIds(supabaseAdmin, property.owner_user_id)
    for (const id of landlordIds) recipients.push({ userId: id, role: 'landlord' })
  }

  // Resolved from whoever actually reported the job, not just whoever
  // currently lives there — a dispute's resolution (including its notes)
  // shouldn't leak to a tenant who moved in after the fact and had nothing
  // to do with it. See resolveReportingTenancy.ts for the full reasoning.
  if (job?.unit_id) {
    const renterIds = await resolveReportingRenterIds(supabaseAdmin, { unit_id: job.unit_id, reported_by: (job as any).reported_by })
    for (const id of renterIds) recipients.push({ userId: id, role: 'renter' })
  }

  const { data: acceptedBid } = await supabaseAdmin
    .from('bids')
    .select('contractor_user_id')
    .eq('job_id', dispute.job_id)
    .eq('status', 'accepted')
    .maybeSingle()
  if (acceptedBid?.contractor_user_id) recipients.push({ userId: acceptedBid.contractor_user_id, role: 'contractor' })

  await Promise.allSettled(
    recipients.map(async ({ userId, role }) => {
      const { data: recipient } = await supabaseAdmin.from('users').select('email, preferred_language, email_notifications_enabled').eq('id', userId).maybeSingle()
      if (recipient?.email && emailAllowed(recipient)) {
        await sendDisputeResolvedEmail({
          to: recipient.email,
          jobCategory,
          propertyLabel,
          outcome,
          resolutionNotes,
          role,
          jobId: dispute.job_id,
          lang: recipient.preferred_language === 'es' ? 'es' : 'en',
        })
      }
      await sendPush(userId, {
        title: 'Dispute resolved',
        body: `${jobCategory} at ${propertyLabel}`,
        url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/${role}/jobs/${dispute.job_id}`,
      }).catch((err) => console.error('disputes/resolve: sendPush failed', { userId, err }))
    })
  )

  return NextResponse.json({ ok: true })
}
