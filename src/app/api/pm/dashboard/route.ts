import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership, scopeOwnerIdsForMember } from '@/lib/pm'

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
  const canViewFinancials = membership.canViewFinancials

  const { data: allPortfolios } = await supabaseAdmin
    .from('pm_client_portfolios')
    .select('id, owner_user_id, approval_threshold, users(full_name, email)')
    .eq('organization_id', membership.organizationId)
    .eq('status', 'accepted')

  const allOwnerIds = (allPortfolios || []).map((p: any) => p.owner_user_id)
  const ownerIds = await scopeOwnerIdsForMember(supabaseAdmin, membership, allOwnerIds)
  const scopedSet = new Set(ownerIds)
  const portfolios = (allPortfolios || []).filter((p: any) => scopedSet.has(p.owner_user_id))
  if (ownerIds.length === 0) {
    return NextResponse.json({ clients: [], canViewFinancials: membership.canViewFinancials, months: [], complianceAlerts: [] })
  }

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  // 6 months back covers the trend chart too -- same rent rows this
  // month's per-client totals already needed, just a wider date range,
  // bucketed client-side below instead of a second query.
  const sixMonthsAgo = new Date(monthStart.getFullYear(), monthStart.getMonth() - 5, 1)

  const [propertiesRes, unitsRes, jobsRes, rentRes, complianceRes, tenancyRes] = await Promise.all([
    supabaseAdmin.from('properties').select('id, owner_user_id, lat, lng, address, city').in('owner_user_id', ownerIds).eq('archived', false),
    supabaseAdmin.from('units').select('id, property_id, properties!inner(owner_user_id)').in('properties.owner_user_id', ownerIds),
    supabaseAdmin
      .from('jobs')
      .select('id, status, units!inner(property_id, properties!inner(owner_user_id))')
      .in('units.properties.owner_user_id', ownerIds)
      .in('status', OPEN_JOB_STATUSES),
    membership.canViewFinancials
      ? supabaseAdmin
          .from('rent_payments')
          .select('actual_amount, paid_date, tenancies!inner(units!inner(property_id, properties!inner(owner_user_id)))')
          .in('tenancies.units.properties.owner_user_id', ownerIds)
          .eq('stripe_status', 'succeeded')
          .gte('paid_date', sixMonthsAgo.toISOString().slice(0, 10))
      : Promise.resolve({ data: [] as any[], error: null }),
    // A PM is operationally responsible for exactly the kind of thing
    // this tracks (a license or inspection lapsing can cost the owner
    // the right to collect rent at all, per the Safe Healthy Homes
    // section every landlord sees on the homepage) -- this was entirely
    // absent from the PM dashboard before, even though every owner's own
    // dashboard has always had it.
    supabaseAdmin
      .from('compliance_items')
      .select('id, item_type, expiry_date, reminder_days, property_id, properties!inner(address, city, owner_user_id)')
      .in('properties.owner_user_id', ownerIds)
      .not('expiry_date', 'is', null),
    // Occupancy (and, from the same rows, expected monthly rent) for the
    // portfolio health score below -- the unit count already queried above
    // says nothing about how many of those units actually have a tenant.
    supabaseAdmin
      .from('tenancies')
      .select('unit_id, rent_amount, units!inner(property_id, properties!inner(owner_user_id))')
      .in('units.properties.owner_user_id', ownerIds)
      .eq('ended', false),
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
    ['compliance', complianceRes],
    ['tenancies', tenancyRes],
  ] as const) {
    if (res.error) console.error(`pm/dashboard: ${name} query failed`, res.error)
  }

  const properties = propertiesRes.data
  const units = unitsRes.data
  const jobs = jobsRes.data

  const propertyCountByOwner = new Map<string, number>()
  for (const p of (properties || []) as any[]) propertyCountByOwner.set(p.owner_user_id, (propertyCountByOwner.get(p.owner_user_id) || 0) + 1)

  const occupiedUnitsByOwner = new Map<string, number>()
  const expectedRentByOwner = new Map<string, number>()
  for (const te of (tenancyRes.data || []) as any[]) {
    const ownerId = te.units?.properties?.owner_user_id
    if (!ownerId) continue
    occupiedUnitsByOwner.set(ownerId, (occupiedUnitsByOwner.get(ownerId) || 0) + 1)
    expectedRentByOwner.set(ownerId, (expectedRentByOwner.get(ownerId) || 0) + Number(te.rent_amount || 0))
  }

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

  const monthStartStr = monthStart.toISOString().slice(0, 10)
  const rentByOwner = new Map<string, number>()
  const months: { key: string; label: string; rent: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(monthStart.getFullYear(), monthStart.getMonth() - i, 1)
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-US', { month: 'short' }), rent: 0 })
  }
  for (const r of (rentRes.data || []) as any[]) {
    const ownerId = r.tenancies?.units?.properties?.owner_user_id
    const amount = Number(r.actual_amount || 0)
    if (ownerId && r.paid_date >= monthStartStr) {
      rentByOwner.set(ownerId, (rentByOwner.get(ownerId) || 0) + amount)
    }
    if (r.paid_date) {
      const d = new Date(r.paid_date + 'T00:00:00')
      const bucket = months.find((m) => m.key === `${d.getFullYear()}-${d.getMonth()}`)
      if (bucket) bucket.rent += amount
    }
  }

  const ownerNameById = new Map<string, string>(
    (portfolios || []).map((p: any) => [p.owner_user_id, p.users?.full_name || p.users?.email || 'Unknown'])
  )

  // Same "due within its own reminder_days window" rule the owner's own
  // dashboard already uses -- not a fixed 30 days, since that's set per
  // item.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const complianceWithDays = ((complianceRes.data || []) as any[]).map((item) => {
    const expiry = new Date(item.expiry_date + 'T00:00:00')
    const daysUntil = Math.round((expiry.getTime() - today.getTime()) / 86400000)
    return {
      id: item.id,
      itemType: item.item_type,
      daysUntil,
      reminderDays: item.reminder_days ?? 30,
      address: item.properties?.address,
      city: item.properties?.city,
      ownerUserId: item.properties?.owner_user_id,
      ownerName: ownerNameById.get(item.properties?.owner_user_id) || 'Unknown',
      propertyId: item.property_id,
    }
  })
  const complianceAlerts = complianceWithDays
    .filter((a) => a.daysUntil <= a.reminderDays)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 10)

  // Health score inputs, per owner -- overdue (already lapsed) counts
  // double an at-risk (within its reminder window but not lapsed yet)
  // item, same relative weight a PM would actually give them.
  const overdueCountByOwner = new Map<string, number>()
  const atRiskCountByOwner = new Map<string, number>()
  for (const item of complianceWithDays) {
    if (!item.ownerUserId) continue
    if (item.daysUntil < 0) overdueCountByOwner.set(item.ownerUserId, (overdueCountByOwner.get(item.ownerUserId) || 0) + 1)
    else if (item.daysUntil <= item.reminderDays) atRiskCountByOwner.set(item.ownerUserId, (atRiskCountByOwner.get(item.ownerUserId) || 0) + 1)
  }

  // One glanceable number per client instead of making a PM scan five
  // separate tiles -- occupancy, compliance, and (financials-permitting)
  // rent collection averaged into a single 0-100 score with a plain-English
  // label. Rent collection is left out of the average (not just hidden)
  // for a staff member without can_view_financials, same reasoning the
  // rent figures themselves are already redacted for.
  function healthScoreFor(ownerId: string, unitCount: number) {
    const occupied = occupiedUnitsByOwner.get(ownerId) || 0
    const occupancyPct = unitCount > 0 ? Math.min(100, (occupied / unitCount) * 100) : 100
    const overdue = overdueCountByOwner.get(ownerId) || 0
    const atRisk = atRiskCountByOwner.get(ownerId) || 0
    const compliancePct = Math.max(0, 100 - overdue * 20 - atRisk * 8)
    const parts = [occupancyPct, compliancePct]
    if (canViewFinancials) {
      const expected = expectedRentByOwner.get(ownerId) || 0
      const collected = rentByOwner.get(ownerId) || 0
      parts.push(expected > 0 ? Math.min(100, (collected / expected) * 100) : 100)
    }
    const score = Math.round(parts.reduce((s, v) => s + v, 0) / parts.length)
    const label = score >= 85 ? 'Healthy' : score >= 60 ? 'Needs attention' : 'At risk'
    return { score, label }
  }

  const clients = (portfolios || []).map((p: any) => ({
    portfolioId: p.id,
    ownerUserId: p.owner_user_id,
    ownerName: p.users?.full_name || p.users?.email || 'Unknown',
    approvalThreshold: Number(p.approval_threshold),
    propertyCount: propertyCountByOwner.get(p.owner_user_id) || 0,
    unitCount: unitCountByOwner.get(p.owner_user_id) || 0,
    occupiedUnitCount: occupiedUnitsByOwner.get(p.owner_user_id) || 0,
    openJobCount: openJobsByOwner.get(p.owner_user_id) || 0,
    rentCollectedThisMonth: membership.canViewFinancials ? rentByOwner.get(p.owner_user_id) || 0 : null,
    health: healthScoreFor(p.owner_user_id, unitCountByOwner.get(p.owner_user_id) || 0),
  }))

  // Unit-weighted (not a plain average of client scores) so a 40-unit
  // client in trouble actually moves the portfolio-wide number more than
  // a 1-unit client does -- a simple average would let a single struggling
  // small client make the whole portfolio look worse than it is, or the
  // reverse.
  const totalUnitsForHealth = clients.reduce((s, c) => s + c.unitCount, 0)
  const orgHealthScore =
    totalUnitsForHealth > 0
      ? Math.round(clients.reduce((s, c) => s + c.health.score * c.unitCount, 0) / totalUnitsForHealth)
      : clients.length > 0
        ? Math.round(clients.reduce((s, c) => s + c.health.score, 0) / clients.length)
        : 100
  const orgHealthLabel = orgHealthScore >= 85 ? 'Healthy' : orgHealthScore >= 60 ? 'Needs attention' : 'At risk'

  // Worst compliance status per property (overdue beats at-risk beats ok),
  // for the map's pin color -- a property with zero tracked compliance
  // items reads as ok, not as a gap to fill in here.
  const worstStatusByProperty = new Map<string, 'overdue' | 'at-risk'>()
  for (const item of complianceWithDays) {
    if (!item.propertyId) continue
    if (item.daysUntil < 0) worstStatusByProperty.set(item.propertyId, 'overdue')
    else if (item.daysUntil <= item.reminderDays && worstStatusByProperty.get(item.propertyId) !== 'overdue') {
      worstStatusByProperty.set(item.propertyId, 'at-risk')
    }
  }
  const mapProperties = ((properties || []) as any[])
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({
      id: p.id,
      address: p.address,
      city: p.city,
      lat: p.lat,
      lng: p.lng,
      ownerName: ownerNameById.get(p.owner_user_id) || 'Unknown',
      complianceStatus: worstStatusByProperty.get(p.id) || 'ok',
    }))

  return NextResponse.json({
    clients,
    canViewFinancials: membership.canViewFinancials,
    months: membership.canViewFinancials ? months : [],
    complianceAlerts,
    orgHealth: { score: orgHealthScore, label: orgHealthLabel },
    mapProperties,
  })
}
