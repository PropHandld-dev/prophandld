import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendDisputeRaisedAdminEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { jobId, reason } = (await request.json()) as { jobId?: string; reason?: string }
  if (!jobId || !reason?.trim()) {
    return NextResponse.json({ error: 'Missing jobId or reason' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .select('id, category, status, landlord_approved_at, unit_id, units(properties(address, owner_user_id))')
    .eq('id', jobId)
    .maybeSingle()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const property = (job.units as any)?.properties
  const isLandlord = property?.owner_user_id === user.id

  const { data: tenancy } = await supabaseAdmin
    .from('tenancies')
    .select('renter_user_id')
    .eq('unit_id', job.unit_id)
    .eq('ended', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const isRenter = tenancy?.renter_user_id === user.id

  const { data: acceptedBid } = await supabaseAdmin
    .from('bids')
    .select('contractor_user_id')
    .eq('job_id', jobId)
    .eq('status', 'accepted')
    .maybeSingle()
  const isContractor = acceptedBid?.contractor_user_id === user.id

  if (!isLandlord && !isRenter && !isContractor) {
    return NextResponse.json({ error: 'Not a participant on this job' }, { status: 403 })
  }

  const withinWindow =
    job.status === 'pending_review' ||
    (job.status === 'completed' &&
      job.landlord_approved_at &&
      Date.now() - new Date(job.landlord_approved_at).getTime() < 48 * 60 * 60 * 1000)

  if (!withinWindow) {
    return NextResponse.json({ error: 'This job is no longer eligible for a dispute' }, { status: 400 })
  }

  const raisedByRole = isLandlord ? 'landlord' : isRenter ? 'renter' : 'contractor'

  const { error: insertError } = await supabaseAdmin.from('disputes').insert({
    job_id: jobId,
    raised_by_user_id: user.id,
    raised_by_role: raisedByRole,
    reason: reason.trim(),
  })

  if (insertError) {
    console.error('disputes/raise: error inserting dispute', insertError)
    return NextResponse.json({ error: 'Could not raise dispute' }, { status: 500 })
  }

  const { error: updateError } = await supabaseAdmin.from('jobs').update({ status: 'disputed' }).eq('id', jobId)
  if (updateError) {
    console.error('disputes/raise: error updating job status', updateError)
  }

  await sendDisputeRaisedAdminEmail({
    jobCategory: job.category,
    propertyLabel: property?.address || 'a property',
    raisedByRole,
    reason: reason.trim(),
    jobId,
  }).catch((err) => console.error('disputes/raise: sendEmail failed', err))

  return NextResponse.json({ ok: true })
}
