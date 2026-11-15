import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 15

const OPEN_JOB_STATUSES = ['pending_approval', 'bidding', 'approved']

// The managed-owner's own counterpart to /api/pm/dashboard -- that route
// answers "how is my portfolio of clients doing" for a PM admin/staff.
// This one answers "how is my own property doing under the company that
// manages it" for the owner on the other side of that relationship, who
// was previously shown an unrelated "run a property management company?"
// upsell card on this same page instead of anything about their actual
// property.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()

  const { data: portfolio } = await admin
    .from('pm_client_portfolios')
    .select('organization_id')
    .eq('owner_user_id', user.id)
    .eq('status', 'accepted')
    .maybeSingle()

  if (!portfolio) {
    return NextResponse.json({ managed: false })
  }

  const { data: properties } = await admin.from('properties').select('id').eq('owner_user_id', user.id).eq('archived', false)
  const propertyIds = (properties || []).map((p) => p.id)

  const [{ data: units }, { data: jobs }, { data: auditRows }] = await Promise.all([
    propertyIds.length > 0 ? admin.from('units').select('id').in('property_id', propertyIds) : Promise.resolve({ data: [] as any[] }),
    propertyIds.length > 0
      ? admin.from('jobs').select('id, status, units!inner(property_id)').in('units.property_id', propertyIds).in('status', OPEN_JOB_STATUSES)
      : Promise.resolve({ data: [] as any[] }),
    admin
      .from('pm_audit_log')
      .select('id, action, amount, created_at, job_id, actor:actor_user_id(full_name)')
      .eq('organization_id', portfolio.organization_id)
      .eq('owner_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  // jobId lets the owner click straight through to the same job-detail page
  // they'd see if they weren't PM-managed at all (photos, bids, receipts,
  // schedule) -- that page already has zero PM-specific gating (see
  // src/app/landlord/jobs/[jobId]/page.tsx), the audit feed just never
  // linked to it, which is what made this page feel like a dead end.
  const entries = (auditRows || []).map((r: any) => ({
    id: r.id,
    action: r.action,
    amount: r.amount !== null ? Number(r.amount) : null,
    createdAt: r.created_at,
    actorName: r.actor?.full_name || 'Someone',
    jobId: r.job_id || null,
  }))

  return NextResponse.json({
    managed: true,
    propertyCount: propertyIds.length,
    unitCount: (units || []).length,
    openJobCount: (jobs || []).length,
    entries,
  })
}

// Owner-only: set the OWNER's own approval threshold on their own
// portfolio row -- previously this value could only be set by the PM
// admin (see /api/pm/clients/[portfolioId]'s own "Admin-only" comment),
// which inverted the actual product rule: the threshold is the owner's
// own permission grant to the PM, not something the PM sets unilaterally
// on the owner's behalf. Scoped to owner_user_id = this user, so it can
// only ever touch the caller's own relationship, never someone else's.
export async function PATCH(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { approvalThreshold?: number }
  if (typeof body.approvalThreshold !== 'number' || body.approvalThreshold < 0) {
    return NextResponse.json({ error: 'Invalid threshold' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: updated, error } = await admin
    .from('pm_client_portfolios')
    .update({ approval_threshold: body.approvalThreshold })
    .eq('owner_user_id', user.id)
    .eq('status', 'accepted')
    .select('id')

  if (error) {
    console.error('pm/my-status: error updating own threshold', error)
    return NextResponse.json({ error: 'Could not update threshold' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'No active PM relationship found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
