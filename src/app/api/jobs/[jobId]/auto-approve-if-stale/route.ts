import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { autoApproveJobIfStale } from '@/lib/autoApproveJob'

// Called by the landlord's and contractor's own job-detail pages right after
// they load a job that's sitting in pending_review — a "don't make someone
// wait for tonight's cron to see accurate status" check. The actual 3-day
// threshold is re-verified server-side in autoApproveJobIfStale, never
// trusted from the caller; this route's own job here is only to confirm the
// caller actually belongs on this job before doing anything.
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
    .select('id, unit_id, units(property_id, properties(owner_user_id))')
    .eq('id', jobId)
    .maybeSingle()

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const property = (job.units as any)?.properties
  let allowed = property?.owner_user_id === user.id

  if (!allowed) {
    const { data: tenancies } = await admin.from('tenancies').select('id, renter_user_id').eq('unit_id', job.unit_id)
    const rows = tenancies || []
    allowed = rows.some((t: any) => t.renter_user_id === user.id)
    if (!allowed && rows.length > 0) {
      const { data: occupant } = await admin
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
    const { data: ownBid } = await admin
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

  const result = await autoApproveJobIfStale(admin, jobId)
  return NextResponse.json(result)
}
