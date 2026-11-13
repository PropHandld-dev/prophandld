import type { SupabaseClient } from '@supabase/supabase-js'

export type PmMembership = {
  memberId: string
  organizationId: string
  organizationName: string
  memberRole: 'admin' | 'staff'
  canViewFinancials: boolean
  scopeAllClients: boolean
  notificationMode: 'realtime' | 'digest'
}

// The PM org a user is an accepted member of, admin or staff — a person
// belongs to at most one at a time (see the schema's one-active-org
// index), so this is a single row, never a list.
export async function getPmMembership(admin: SupabaseClient, userId: string): Promise<PmMembership | null> {
  const { data } = await admin
    .from('pm_organization_members')
    .select('id, organization_id, member_role, can_view_financials, scope_all_clients, notification_mode, pm_organizations(name)')
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .maybeSingle()

  if (!data) return null
  return {
    memberId: data.id,
    organizationId: data.organization_id,
    organizationName: (data.pm_organizations as any)?.name || 'Property manager',
    memberRole: data.member_role,
    canViewFinancials: data.can_view_financials,
    scopeAllClients: data.scope_all_clients ?? true,
    notificationMode: (data.notification_mode as 'realtime' | 'digest') || 'realtime',
  }
}

// Narrows a full "every accepted client" list down to what one specific
// member can actually see -- a no-op (returns the list unchanged) for an
// admin or any staff member who hasn't been scoped, which is every
// member until an admin deliberately narrows one. Centralized here so
// every PM-wide route (clients list, dashboard, pending approvals, audit
// log) applies the same rule instead of each reimplementing it.
export async function scopeOwnerIdsForMember(
  admin: SupabaseClient,
  membership: PmMembership,
  allAcceptedOwnerIds: string[]
): Promise<string[]> {
  if (membership.memberRole === 'admin' || membership.scopeAllClients) return allAcceptedOwnerIds
  const { data } = await admin.from('pm_staff_client_access').select('owner_user_id').eq('member_id', membership.memberId)
  const allowed = new Set((data || []).map((r: any) => r.owner_user_id))
  return allAcceptedOwnerIds.filter((id) => allowed.has(id))
}

// Same gap landlord_co_owners' own getLandlordIdsAdmin comment flags:
// my_landlord_ids() resolves off auth.uid(), which is unset under the
// service-role client used by API routes, so a route needs the
// equivalent lookup done explicitly instead.
export async function getActionableOwnerIdsAdmin(admin: SupabaseClient, userId: string): Promise<string[]> {
  const [{ data: coOwned }, membership] = await Promise.all([
    admin.from('landlord_co_owners').select('primary_landlord_user_id').eq('co_owner_user_id', userId).eq('status', 'accepted'),
    getPmMembership(admin, userId),
  ])

  const ids = new Set<string>([userId, ...((coOwned || []) as { primary_landlord_user_id: string }[]).map((r) => r.primary_landlord_user_id)])

  if (membership) {
    const { data: portfolios } = await admin
      .from('pm_client_portfolios')
      .select('owner_user_id')
      .eq('organization_id', membership.organizationId)
      .eq('status', 'accepted')
    const orgOwnerIds = (portfolios || []).map((r: any) => r.owner_user_id)
    const scoped = await scopeOwnerIdsForMember(admin, membership, orgOwnerIds)
    for (const id of scoped) ids.add(id)
  }

  return Array.from(ids)
}

// Does acting on `ownerUserId`'s behalf for `amount` need the owner's own
// sign-off? Only ever true for a PM staff/admin acting on a client who
// isn't themselves, and only when the amount clears that specific
// client's threshold — the owner acting on their own property, and a
// plain co-owner (no threshold concept), are always allowed through.
export async function approvalNeedsOwnerSignoff(
  admin: SupabaseClient,
  actorUserId: string,
  ownerUserId: string,
  amount: number
): Promise<{ blocked: boolean; organizationId?: string }> {
  if (actorUserId === ownerUserId) return { blocked: false }

  const membership = await getPmMembership(admin, actorUserId)
  if (!membership) return { blocked: false }

  const { data: portfolio } = await admin
    .from('pm_client_portfolios')
    .select('approval_threshold')
    .eq('organization_id', membership.organizationId)
    .eq('owner_user_id', ownerUserId)
    .eq('status', 'accepted')
    .maybeSingle()

  if (!portfolio) return { blocked: false }
  return { blocked: amount > Number(portfolio.approval_threshold), organizationId: membership.organizationId }
}

// Every accepted client's owner_user_id for one org -- the piece several
// PM-wide features (contractor network, bulk approvals, portfolio
// exports) all need: "every owner this org manages," not "what can this
// one actor do" (that's getActionableOwnerIdsAdmin, which also folds in
// co-owner relationships this doesn't need to).
export async function getOrgManagedOwnerIds(admin: SupabaseClient, organizationId: string): Promise<string[]> {
  const { data } = await admin
    .from('pm_client_portfolios')
    .select('owner_user_id')
    .eq('organization_id', organizationId)
    .eq('status', 'accepted')
  return (data || []).map((r: any) => r.owner_user_id)
}

// True only when the OWNER themselves (not PM staff/admin) is acting on a
// client portfolio that's been marked read-only -- this is the one piece
// of owner_read_only actually enforced server-side; see the schema
// script's own comment for why it isn't an RLS-level restriction.
export async function isBlockedByOwnerReadOnly(admin: SupabaseClient, actorUserId: string, ownerUserId: string): Promise<boolean> {
  if (actorUserId !== ownerUserId) return false
  const { data } = await admin
    .from('pm_client_portfolios')
    .select('owner_read_only')
    .eq('owner_user_id', ownerUserId)
    .eq('status', 'accepted')
    .maybeSingle()
  return !!data?.owner_read_only
}

// For the white-label touch on tenant/contractor-facing emails: if this
// owner is PM-managed, their org's name, else null. Never resolved for
// the owner/PM's own notifications -- only for the renter/contractor
// side, where "Managed by X" is a real, useful signal of who's actually
// behind the message.
export async function getManagingPmName(admin: SupabaseClient, ownerUserId: string): Promise<string | null> {
  const { data } = await admin
    .from('pm_client_portfolios')
    .select('pm_organizations(name)')
    .eq('owner_user_id', ownerUserId)
    .eq('status', 'accepted')
    .maybeSingle()
  return (data?.pm_organizations as any)?.name || null
}

export async function logPmAction(
  admin: SupabaseClient,
  params: {
    organizationId: string
    ownerUserId: string
    actorUserId: string
    action: string
    jobId?: string
    bidId?: string
    amount?: number
    detail?: string
  }
): Promise<void> {
  await admin.from('pm_audit_log').insert({
    organization_id: params.organizationId,
    owner_user_id: params.ownerUserId,
    actor_user_id: params.actorUserId,
    action: params.action,
    job_id: params.jobId || null,
    bid_id: params.bidId || null,
    amount: params.amount ?? null,
    detail: params.detail || null,
  })
}
