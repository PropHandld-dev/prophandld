import type { SupabaseClient } from '@supabase/supabase-js'

// Every owner_user_id value this session should query by: your own id,
// plus any primary landlord's id you're an accepted co-owner of.
// Centralizes what used to be scattered `.eq('owner_user_id', user.id)`
// filters — each becomes `.in('owner_user_id', await getLandlordIds(...))`.
// Mirrors my_landlord_ids() in scripts/2026-10-17-co-landlord.sql, the
// RLS-level source of truth this just reflects for client-side query
// filters (RLS alone already scopes results correctly, but an explicit
// .eq() filter on top of it would still zero out a co-owner's results,
// since their own id never equals the primary's owner_user_id).
//
// A plain async function, not a hook — every call site here is a
// one-shot async load already running inside a useEffect, not a
// component that needs reactive re-renders off this value.
export async function getLandlordIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('my_landlord_ids')
  return !error && data?.length ? data : [userId]
}

// Same answer as getLandlordIds, for the service-role routes that can't use
// it — my_landlord_ids() resolves off auth.uid(), which is unset under the
// admin client, so it silently falls back to just [userId] there, same as
// passing no co-owner relationship existed at all. Found via a real
// landlord's AI help-chat undercounting their own property/unit count
// (co-owned properties, owned by a different primary landlord, were
// excluded) — portfolio-digest has the same gap, documented in its own
// comment, for the same reason.
export async function getLandlordIdsAdmin(admin: { from: (table: string) => any }, userId: string): Promise<string[]> {
  const { data } = await admin
    .from('landlord_co_owners')
    .select('primary_landlord_user_id')
    .eq('co_owner_user_id', userId)
    .eq('status', 'accepted')
  return [userId, ...((data || []) as { primary_landlord_user_id: string }[]).map((r) => r.primary_landlord_user_id)]
}
