import type { SupabaseClient } from '@supabase/supabase-js'

export type PmMembership = {
  organizationId: string
  organizationName: string
  memberRole: 'admin' | 'staff'
  canViewFinancials: boolean
}

// The PM org a user is an accepted member of, admin or staff — a person
// belongs to at most one at a time (see the schema's one-active-org
// index), so this is a single row, never a list.
export async function getPmMembership(admin: SupabaseClient, userId: string): Promise<PmMembership | null> {
  const { data } = await admin
    .from('pm_organization_members')
    .select('organization_id, member_role, can_view_financials, pm_organizations(name)')
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .maybeSingle()

  if (!data) return null
  return {
    organizationId: data.organization_id,
    organizationName: (data.pm_organizations as any)?.name || 'Property manager',
    memberRole: data.member_role,
    canViewFinancials: data.can_view_financials,
  }
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
    for (const row of (portfolios || []) as { owner_user_id: string }[]) ids.add(row.owner_user_id)
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
