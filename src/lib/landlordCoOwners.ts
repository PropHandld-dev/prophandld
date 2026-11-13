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
      .select('id, user_id, member_role, scope_all_clients, notification_mode')
      .eq('organization_id', portfolio.organization_id)
      .eq('status', 'accepted')

    // Two more things govern whether a member actually belongs in a
    // real-time notification, caught during the staff-scoping and
    // digest-mode work: a member scoped to specific clients shouldn't
    // hear about one they're not assigned to, and a member who opted
    // into a daily digest shouldn't get the same event twice over --
    // once here, once in their digest.
    const scopedMembers = (members || []).filter((m: any) => m.user_id && m.member_role === 'staff' && !m.scope_all_clients)
    let allowedMemberIds = new Set<string>()
    if (scopedMembers.length > 0) {
      const { data: access } = await admin
        .from('pm_staff_client_access')
        .select('member_id')
        .in('member_id', scopedMembers.map((m: any) => m.id))
        .eq('owner_user_id', primaryLandlordUserId)
      allowedMemberIds = new Set((access || []).map((a: any) => a.member_id))
    }

    for (const m of (members || []) as any[]) {
      if (!m.user_id || m.notification_mode === 'digest') continue
      const isScoped = m.member_role === 'staff' && !m.scope_all_clients
      if (isScoped && !allowedMemberIds.has(m.id)) continue
      ids.add(m.user_id)
    }
  }

  return Array.from(ids)
}
