import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendDisputeResolvedEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !user.email?.endsWith('@prophandld.com')) {
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

  const { error: jobUpdateError } = await supabaseAdmin
    .from('jobs')
    .update({ status: 'completed' })
    .eq('id', dispute.job_id)

  if (jobUpdateError) {
    console.error('disputes/resolve: error reverting job status', jobUpdateError)
  }

  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('category, unit_id, units(properties(address, owner_user_id))')
    .eq('id', dispute.job_id)
    .maybeSingle()

  const property = (job?.units as any)?.properties
  const propertyLabel = property?.address || 'the property'
  const jobCategory = job?.category || 'the job'

  const recipients: { userId: string; role: 'landlord' | 'renter' | 'contractor' }[] = []
  if (property?.owner_user_id) recipients.push({ userId: property.owner_user_id, role: 'landlord' })

  const { data: tenancy } = await supabaseAdmin
    .from('tenancies')
    .select('renter_user_id')
    .eq('unit_id', job?.unit_id)
    .eq('ended', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (tenancy?.renter_user_id) recipients.push({ userId: tenancy.renter_user_id, role: 'renter' })

  const { data: acceptedBid } = await supabaseAdmin
    .from('bids')
    .select('contractor_user_id')
    .eq('job_id', dispute.job_id)
    .eq('status', 'accepted')
    .maybeSingle()
  if (acceptedBid?.contractor_user_id) recipients.push({ userId: acceptedBid.contractor_user_id, role: 'contractor' })

  await Promise.allSettled(
    recipients.map(async ({ userId, role }) => {
      const { data: recipient } = await supabaseAdmin.from('users').select('email').eq('id', userId).maybeSingle()
      if (!recipient?.email) return
      await sendDisputeResolvedEmail({
        to: recipient.email,
        jobCategory,
        propertyLabel,
        outcome,
        resolutionNotes,
        role,
        jobId: dispute.job_id,
      })
    })
  )

  return NextResponse.json({ ok: true })
}
