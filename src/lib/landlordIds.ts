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
