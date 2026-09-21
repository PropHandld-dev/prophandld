import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// The selected contractor hands finished work to the landlord for review.
// Proof of work is required: at least one "after" photo. (Before photos stay
// optional, since an emergency job may start before anyone takes a picture.)
// Checked here, on the server, so it cannot be skipped from the browser.
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
    .select('id')
    .eq('job_id', jobId)
    .eq('contractor_user_id', user.id)
    .eq('status', 'accepted')
    .maybeSingle()
  if (!bid) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const { data: job } = await admin.from('jobs').select('id, status').eq('id', jobId).maybeSingle()
  if (!job || job.status !== 'in_progress') {
    return NextResponse.json({ error: 'This job is not in progress, so it can’t be marked complete.' }, { status: 400 })
  }

  const { data: afterPhotos } = await admin
    .from('job_photos')
    .select('id')
    .eq('job_id', jobId)
    .eq('stage', 'after')
    .limit(1)
  if (!afterPhotos || afterPhotos.length === 0) {
    return NextResponse.json({ error: 'Add at least one “After” photo before marking the job complete.' }, { status: 400 })
  }

  const { data: updated, error } = await admin
    .from('jobs')
    .update({ status: 'pending_review', contractor_completed_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'in_progress')
    .select('id')

  if (error || !updated || updated.length === 0) {
    console.error('contractor/complete-job: could not update the job', error)
    return NextResponse.json({ error: 'Could not mark the job complete. Refresh and try again.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
