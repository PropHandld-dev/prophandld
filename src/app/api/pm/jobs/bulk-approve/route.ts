import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership, getOrgManagedOwnerIds, logPmAction } from '@/lib/pm'

export const maxDuration = 30

// Same write the single-job "Approve" button already does
// (jobs/[jobId]/page.tsx's confirmApproveCompletion) -- status stays
// 'completed' (that's already true from the contractor's side),
// landlord_approved_at is the real approval signal that starts the
// 3-day dispute window. Deliberately does NOT re-check each job's
// approval threshold here -- that gate (approvalNeedsOwnerSignoff) is
// about authorizing an actual PAYMENT, a separate and later step; this
// is just "I reviewed the finished work," the same thing any landlord
// does before ever touching Stripe.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const membership = await getPmMembership(admin, user.id)
  if (!membership) {
    return NextResponse.json({ error: 'Not a property management org member' }, { status: 403 })
  }

  const { jobIds } = (await request.json().catch(() => ({}))) as { jobIds?: string[] }
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return NextResponse.json({ error: 'Missing jobIds' }, { status: 400 })
  }

  const ownerIds = await getOrgManagedOwnerIds(admin, membership.organizationId)

  // Confirm every requested job actually belongs to this org's own
  // managed clients -- a crafted request naming a job from elsewhere
  // must not be able to approve it just by being in the list.
  const { data: jobs } = await admin
    .from('jobs')
    .select('id, status, landlord_approved_at, units!inner(property_id, properties!inner(owner_user_id))')
    .in('id', jobIds)
    .eq('status', 'completed')
    .is('landlord_approved_at', null)

  const eligibleIds = (jobs || [])
    .filter((j: any) => ownerIds.includes(j.units?.properties?.owner_user_id))
    .map((j: any) => j.id)

  if (eligibleIds.length === 0) {
    return NextResponse.json({ approved: 0 })
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await admin
    .from('jobs')
    .update({ landlord_approved_at: now })
    .in('id', eligibleIds)
    .is('landlord_approved_at', null)
    .select('id, units(properties(owner_user_id))')

  if (error) {
    console.error('pm/jobs/bulk-approve: update failed', error)
    return NextResponse.json({ error: 'Could not approve those jobs' }, { status: 500 })
  }

  // Same notification every single-job approval already fires
  // (notify('job_completed', jobId)) -- forwarding this request's own
  // cookies rather than duplicating /api/notify's recipient-resolution
  // logic here.
  const cookieHeader = request.headers.get('cookie') || ''
  await Promise.all(
    (updated || []).map((j: any) =>
      fetch(new URL('/api/notify', request.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
        body: JSON.stringify({ type: 'job_completed', jobId: j.id }),
      }).catch((err) => console.error('pm/jobs/bulk-approve: notify failed for', j.id, err))
    )
  )

  for (const j of (updated || []) as any[]) {
    const ownerId = j.units?.properties?.owner_user_id
    if (ownerId) {
      await logPmAction(admin, {
        organizationId: membership.organizationId,
        ownerUserId: ownerId,
        actorUserId: user.id,
        action: 'job_bulk_approved',
        jobId: j.id,
      }).catch(() => {})
    }
  }

  return NextResponse.json({ approved: (updated || []).length })
}
