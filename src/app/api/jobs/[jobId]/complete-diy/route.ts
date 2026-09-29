import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// A landlord marking their own job fixed, no contractor and no payment
// involved. Deliberately does NOT set landlord_approved_at — that column is
// what makes the 48-hour dispute window eligible elsewhere in the app, and
// there's no one else's work here to dispute. self_completed_at is the real
// completion timestamp for this path instead.
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()

  const { data: job } = await admin
    .from('jobs')
    .select('id, status, units(property_id, properties(owner_user_id))')
    .eq('id', jobId)
    .maybeSingle()

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const property = (job.units as any)?.properties
  if (property?.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (!['approved', 'bidding'].includes(job.status)) {
    return NextResponse.json({ error: 'This job can no longer be marked as handled yourself.' }, { status: 400 })
  }

  const { data: acceptedBid } = await admin
    .from('bids')
    .select('id')
    .eq('job_id', jobId)
    .eq('status', 'accepted')
    .maybeSingle()
  if (acceptedBid) {
    return NextResponse.json({ error: 'A contractor is already on this job.' }, { status: 400 })
  }

  // Same proof-of-work bar as a contractor closing out a job — checked here
  // too, not just client-side, so it can't be skipped.
  const { data: afterPhotos } = await admin
    .from('job_photos')
    .select('id')
    .eq('job_id', jobId)
    .eq('stage', 'after')
    .limit(1)
  if (!afterPhotos || afterPhotos.length === 0) {
    return NextResponse.json({ error: 'Add at least one photo of the finished work before marking it fixed.' }, { status: 400 })
  }

  const { error: updateError } = await admin
    .from('jobs')
    .update({
      status: 'completed',
      self_completed: true,
      self_completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .in('status', ['approved', 'bidding'])

  if (updateError) {
    console.error('complete-diy: could not update job', { jobId, updateError })
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Any still-open sealed bids on this job need to be closed out, mirroring
  // the same cleanup a decline/cancel already does elsewhere — a contractor
  // should never see a "Pending" bid sitting on a job that just closed
  // without them.
  await admin.from('bids').update({ status: 'declined' }).eq('job_id', jobId).eq('status', 'pending')

  return NextResponse.json({ ok: true })
}
