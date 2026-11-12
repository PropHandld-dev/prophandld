import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership } from '@/lib/pm'

export const maxDuration = 20

const OPEN_JOB_STATUSES = ['pending_approval', 'bidding', 'approved']

// One row per accepted client, for the portfolio switcher + combined
// view. Financial figures (rent collected) are omitted entirely for a
// staff member without can_view_financials — the app-layer enforcement
// documented in the schema script, since RLS can't redact a column.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const membership = await getPmMembership(supabaseAdmin, user.id)
  if (!membership) {
    return NextResponse.json({ error: 'Not a property management org member' }, { status: 403 })
  }

  const { data: portfolios } = await supabaseAdmin
    .from('pm_client_portfolios')
    .select('id, owner_user_id, approval_threshold, users(full_name, email)')
    .eq('organization_id', membership.organizationId)
    .eq('status', 'accepted')

  const ownerIds = (portfolios || []).map((p: any) => p.owner_user_id)
  if (ownerIds.length === 0) {
    return NextResponse.json({ clients: [], canViewFinancials: membership.canViewFinancials })
  }

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [propertiesRes, unitsRes, jobsRes, rentRes] = await Promise.all([
    supabaseAdmin.from('properties').select('id, owner_user_id').in('owner_user_id', ownerIds).eq('archived', false),
    supabaseAdmin.from('units').select('id, property_id, properties!inner(owner_user_id)').in('properties.owner_user_id', ownerIds),
    supabaseAdmin
      .from('jobs')
      .select('id, status, units!inner(property_id, properties!inner(owner_user_id))')
      .in('units.properties.owner_user_id', ownerIds)
      .in('status', OPEN_JOB_STATUSES),
    membership.canViewFinancials
      ? supabaseAdmin
          .from('rent_payments')
          .select('actual_amount, tenancies!inner(units!inner(property_id, properties!inner(owner_user_id)))')
          .in('tenancies.units.properties.owner_user_id', ownerIds)
          .eq('stripe_status', 'succeeded')
          .gte('paid_date', monthStart.toISOString().slice(0, 10))
      : Promise.resolve({ data: [] as any[], error: null }),
  ])

  // Every one of these uses PostgREST's nested-embed filter syntax
  // (.in('properties.owner_user_id', ...) through an !inner join) --
  // an already-proven pattern elsewhere in this codebase (e.g.
  // invite-contractor/route.ts's .eq('jobs.units.properties.owner_user_id', ...)),
  // but Supabase's client never throws on a query error, just returns
  // { data: null, error } -- silently treating that as "zero results"
  // here would make a malformed filter look like an empty portfolio
  // instead of a bug. Logged, not surfaced to the response: a partial
  // dashboard (e.g. rent figures failed but unit counts didn't) is more
  // useful to a PM than a hard 500.
  for (const [name, res] of [
    ['properties', propertiesRes],
    ['units', unitsRes],
    ['jobs', jobsRes],
    ['rent', rentRes],
  ] as const) {
    if (res.error) console.error(`pm/dashboard: ${name} query failed`, res.error)
  }

  const properties = propertiesRes.data
  const units = unitsRes.data
  const jobs = jobsRes.data

  const propertyCountByOwner = new Map<string, number>()
  for (const p of (properties || []) as any[]) propertyCountByOwner.set(p.owner_user_id, (propertyCountByOwner.get(p.owner_user_id) || 0) + 1)

  const unitCountByOwner = new Map<string, number>()
  for (const u of (units || []) as any[]) {
    const ownerId = u.properties?.owner_user_id
    if (ownerId) unitCountByOwner.set(ownerId, (unitCountByOwner.get(ownerId) || 0) + 1)
  }

  const openJobsByOwner = new Map<string, number>()
  for (const j of (jobs || []) as any[]) {
    const ownerId = j.units?.properties?.owner_user_id
    if (ownerId) openJobsByOwner.set(ownerId, (openJobsByOwner.get(ownerId) || 0) + 1)
  }

  const rentByOwner = new Map<string, number>()
  for (const r of (rentRes.data || []) as any[]) {
    const ownerId = r.tenancies?.units?.properties?.owner_user_id
    if (ownerId) rentByOwner.set(ownerId, (rentByOwner.get(ownerId) || 0) + Number(r.actual_amount || 0))
  }

  const clients = (portfolios || []).map((p: any) => ({
    portfolioId: p.id,
    ownerUserId: p.owner_user_id,
    ownerName: p.users?.full_name || p.users?.email || 'Unknown',
    approvalThreshold: Number(p.approval_threshold),
    propertyCount: propertyCountByOwner.get(p.owner_user_id) || 0,
    unitCount: unitCountByOwner.get(p.owner_user_id) || 0,
    openJobCount: openJobsByOwner.get(p.owner_user_id) || 0,
    rentCollectedThisMonth: membership.canViewFinancials ? rentByOwner.get(p.owner_user_id) || 0 : null,
  }))

  return NextResponse.json({ clients, canViewFinancials: membership.canViewFinancials })
}
