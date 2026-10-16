import type { SupabaseClient } from '@supabase/supabase-js'

// Given a property's owner_user_id, every user id a landlord-facing
// notification/chat should also reach: the primary, plus any accepted
// co-owner. A plain table read, not the my_landlord_ids() RPC — every
// caller here already holds a service-role admin client (RLS doesn't
// apply), so the security-definer function would just add a round trip
// for nothing.
export async function notifyLandlordIds(admin: SupabaseClient, primaryLandlordUserId: string): Promise<string[]> {
  const { data } = await admin
    .from('landlord_co_owners')
    .select('co_owner_user_id')
    .eq('primary_landlord_user_id', primaryLandlordUserId)
    .eq('status', 'accepted')
  return [primaryLandlordUserId, ...(data || []).map((r: any) => r.co_owner_user_id).filter(Boolean)]
}
