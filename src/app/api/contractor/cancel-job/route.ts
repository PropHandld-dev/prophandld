import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// A contractor backs out of a job they were selected for. The job goes back
// to open bidding and their bid is declined, together.
//
// This runs on the server on purpose. From the browser the bid had to be
// declined first, and the rule that lets a contractor edit a job requires
// their bid to still be accepted, so the job update was silently refused and
// the job stayed "scheduled and confirmed" for the landlord forever.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { jobId } = (await request.json()) as { jobId?: string }
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  const { data: bid } = await admin
    .from('bids')
    .select('id, payment_status')
    .eq('job_id', jobId)
    .eq('contractor_user_id', user.id)
    .eq('status', 'accepted')
    .maybeSingle()

  if (!bid) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const { data: job } = await admin
    .from('jobs')
    .select('id, status, proposed_date, proposed_window, proposed_time, proposed_by, schedule_confirmed, schedule_ask_tenant')
    .eq('id', jobId)
    .maybeSingle()

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  if (!['bid_selected', 'scheduled', 'in_progress'].includes(job.status)) {
    return NextResponse.json({ error: 'This job can no longer be cancelled.' }, { status: 400 })
  }
  if (bid.payment_status === 'paid' || bid.payment_status === 'processing') {
    return NextResponse.json({ error: 'This job has already been paid, so it can’t be cancelled here.' }, { status: 400 })
  }

  const { error: jobError } = await admin
    .from('jobs')
    .update({
      status: 'bidding',
      proposed_date: null,
      proposed_window: null,
      proposed_time: null,
      proposed_by: null,
      schedule_confirmed: false,
      schedule_ask_tenant: false,
    })
    .eq('id', jobId)

  if (jobError) {
    console.error('contractor/cancel-job: could not reopen the job', jobError)
    return NextResponse.json({ error: 'Could not reopen the job.' }, { status: 500 })
  }

  const { error: bidError } = await admin.from('bids').update({ status: 'declined' }).eq('id', bid.id)

  if (bidError) {
    console.error('contractor/cancel-job: could not decline the bid, restoring the job', bidError)
    // Put the job back exactly as it was so it is never left half-cancelled.
    await admin
      .from('jobs')
      .update({
        status: job.status,
        proposed_date: job.proposed_date,
        proposed_window: job.proposed_window,
        proposed_time: job.proposed_time,
        proposed_by: job.proposed_by,
        schedule_confirmed: job.schedule_confirmed,
        schedule_ask_tenant: job.schedule_ask_tenant,
      })
      .eq('id', jobId)
    return NextResponse.json({ error: 'Could not cancel. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
