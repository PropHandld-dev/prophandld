import { NextResponse } from 'next/server'
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
      .select('id, action, amount, created_at, actor:actor_user_id(full_name)')
      .eq('organization_id', portfolio.organization_id)
      .eq('owner_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const entries = (auditRows || []).map((r: any) => ({
    id: r.id,
    action: r.action,
    amount: r.amount !== null ? Number(r.amount) : null,
    createdAt: r.created_at,
    actorName: r.actor?.full_name || 'Someone',
  }))

  return NextResponse.json({
    managed: true,
    propertyCount: propertyIds.length,
    unitCount: (units || []).length,
    openJobCount: (jobs || []).length,
    entries,
  })
}
