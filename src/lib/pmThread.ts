import type { SupabaseClient } from '@supabase/supabase-js'
import { getPmMembership, scopeOwnerIdsForMember } from '@/lib/pm'

type Admin = SupabaseClient

// Resolves which PM<->owner conversation the caller is in.
//  - Owner: their accepted PM (no ?owner needed).
//  - PM member: ?owner=<client id>, limited to clients they're assigned.
export async function resolvePair(admin: Admin, userId: string, ownerParam: string | null) {
  if (!ownerParam || ownerParam === userId) {
    const { data: portfolio } = await admin
      .from('pm_client_portfolios')
      .select('organization_id, owner_user_id, pm_organizations(name, admin_user_id, logo_url)')
      .eq('owner_user_id', userId)
      .eq('status', 'accepted')
      .maybeSingle()
    if (portfolio) {
      return {
        side: 'owner' as const,
        organizationId: portfolio.organization_id as string,
        ownerUserId: userId,
        orgName: (portfolio as any).pm_organizations?.name || 'Your property manager',
        orgAdminId: (portfolio as any).pm_organizations?.admin_user_id as string | null,
        logoUrl: (portfolio as any).pm_organizations?.logo_url as string | null,
      }
    }
    if (!ownerParam) return null
  }
  const membership = await getPmMembership(admin, userId)
  if (!membership || !ownerParam) return null
  const { data: portfolio } = await admin
    .from('pm_client_portfolios')
    .select('owner_user_id, pm_organizations(name, admin_user_id, logo_url)')
    .eq('organization_id', membership.organizationId)
    .eq('owner_user_id', ownerParam)
    .eq('status', 'accepted')
    .maybeSingle()
  if (!portfolio) return null
  const allowed = await scopeOwnerIdsForMember(admin, membership, [ownerParam])
  if (!allowed.includes(ownerParam)) return null
  return {
    side: 'pm' as const,
    organizationId: membership.organizationId,
    ownerUserId: ownerParam,
    orgName: (portfolio as any).pm_organizations?.name || membership.organizationName,
    orgAdminId: (portfolio as any).pm_organizations?.admin_user_id as string | null,
    logoUrl: (portfolio as any).pm_organizations?.logo_url as string | null,
    canViewFinancials: membership.canViewFinancials,
  }
}

