import type { SupabaseClient } from '@supabase/supabase-js'

// Given a property's owner_user_id, every user id a landlord-facing
// notification/chat should also reach: the primary, any accepted
// co-owner, and — this was missing entirely until caught by a live
// test of the tenant-reports-issue -> PM-gets-notified loop — every
// accepted member of the property management company managing this
// owner, if any. Without this, a PM's staff had zero way to find out
// about a new job, bid, dispute, or anything else short of refreshing
// the dashboard themselves; this one function feeds notify/route.ts,
// every cron reminder, chat participants, and job/rent payment
// notifications, so fixing it here closes the gap everywhere at once
// rather than needing a one-by-one audit of each call site.
// Same breadth as a co-owner gets today (every notification type, no
// financial-visibility gating) — consistent with that existing,
// already-shipped precedent rather than a new, finer-grained model.
export async function notifyLandlordIds(admin: SupabaseClient, primaryLandlordUserId: string): Promise<string[]> {
  const [{ data: coOwners }, { data: portfolio }] = await Promise.all([
    admin
      .from('landlord_co_owners')
      .select('co_owner_user_id')
      .eq('primary_landlord_user_id', primaryLandlordUserId)
      .eq('status', 'accepted'),
    admin
      .from('pm_client_portfolios')
      .select('organization_id')
      .eq('owner_user_id', primaryLandlordUserId)
      .eq('status', 'accepted')
      .maybeSingle(),
  ])

  const ids = new Set<string>([primaryLandlordUserId, ...(coOwners || []).map((r: any) => r.co_owner_user_id).filter(Boolean)])

  if (portfolio) {
    const { data: members } = await admin
      .from('pm_organization_members')
      .select('user_id')
      .eq('organization_id', portfolio.organization_id)
      .eq('status', 'accepted')
    for (const m of (members || []) as { user_id: string | null }[]) if (m.user_id) ids.add(m.user_id)
  }

  return Array.from(ids)
}
