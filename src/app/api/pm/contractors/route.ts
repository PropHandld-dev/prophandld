import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership, getOrgManagedOwnerIds, scopeOwnerIdsForMember } from '@/lib/pm'

export const maxDuration = 20

// The shared contractor network: every contractor who has ever done a
// PAID job for ANY client this org manages, in one list -- not something
// that existed before. favorite_contractors already works across clients
// for free (it's keyed to the PM's own user id, not per-property), but
// nothing surfaced "everyone my team has actually hired across every
// client" in one place, which is the real value for a PM managing many
// portfolios: reuse a contractor on a different client's job without
// having to remember which property you used them on, or re-invite them
// from scratch.
export async function GET() {
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

  const orgOwnerIds = await getOrgManagedOwnerIds(admin, membership.organizationId)
  const ownerIds = await scopeOwnerIdsForMember(admin, membership, orgOwnerIds)
  if (ownerIds.length === 0) {
    return NextResponse.json({ contractors: [] })
  }

  const { data: bids, error } = await admin
    .from('bids')
    .select('contractor_user_id, amount, paid_at, jobs!inner(category, units!inner(property_id, properties!inner(owner_user_id, address)))')
    .eq('payment_status', 'paid')
    .in('jobs.units.properties.owner_user_id', ownerIds)
    .order('paid_at', { ascending: false })

  if (error) {
    console.error('pm/contractors: query failed', error)
    return NextResponse.json({ error: 'Could not load your contractor network' }, { status: 500 })
  }

  type Agg = { contractorId: string; jobsCount: number; totalPaid: number; categories: Set<string>; lastUsedAt: string | null; lastClientAddress: string | null }
  const byContractor = new Map<string, Agg>()
  for (const b of (bids || []) as any[]) {
    const id = b.contractor_user_id
    const existing = byContractor.get(id) || { contractorId: id, jobsCount: 0, totalPaid: 0, categories: new Set<string>(), lastUsedAt: null, lastClientAddress: null }
    existing.jobsCount += 1
    existing.totalPaid += Number(b.amount || 0)
    if (b.jobs?.category) existing.categories.add(b.jobs.category)
    if (!existing.lastUsedAt) {
      existing.lastUsedAt = b.paid_at
      existing.lastClientAddress = b.jobs?.units?.properties?.address || null
    }
    byContractor.set(id, existing)
  }

  const contractorIds = Array.from(byContractor.keys())
  const [{ data: users }, { data: favorites }] = await Promise.all([
    admin.from('users').select('id, full_name, service_categories').in('id', contractorIds),
    admin.from('favorite_contractors').select('contractor_user_id').eq('landlord_user_id', user.id).in('contractor_user_id', contractorIds),
  ])
  const usersById = new Map((users || []).map((u: any) => [u.id, u]))
  const favoritedIds = new Set((favorites || []).map((f: any) => f.contractor_user_id))

  const contractors = contractorIds
    .map((id) => {
      const agg = byContractor.get(id)!
      return {
        id,
        name: usersById.get(id)?.full_name || 'Contractor',
        categories: Array.from(agg.categories),
        jobsCount: agg.jobsCount,
        totalPaid: agg.totalPaid,
        lastUsedAt: agg.lastUsedAt,
        lastClientAddress: agg.lastClientAddress,
        isFavorite: favoritedIds.has(id),
      }
    })
    .sort((a, b) => b.jobsCount - a.jobsCount)

  return NextResponse.json({ contractors })
}
