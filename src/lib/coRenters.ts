import type { SupabaseClient } from '@supabase/supabase-js'

// Given a tenancy's primary renter_user_id, every user id a renter-facing
// notification/chat should also reach: the primary tenant, plus any
// co-renters on that same tenancy. A plain table read, not an RPC — every
// caller here already holds a service-role admin client (RLS doesn't
// apply), same reasoning as notifyLandlordIds in lib/landlordCoOwners.ts.
export async function notifyRenterIds(admin: SupabaseClient, tenancyId: string, primaryRenterUserId: string): Promise<string[]> {
  const { data } = await admin
    .from('tenancy_occupants')
    .select('renter_user_id')
    .eq('tenancy_id', tenancyId)
  return [primaryRenterUserId, ...(data || []).map((r: any) => r.renter_user_id).filter(Boolean)]
}
