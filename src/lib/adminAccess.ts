import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Replaces the old "any @prophandld.com email is an admin" check — that
// granted full admin access to anyone who ever ended up with that domain,
// test accounts included, with no deliberate per-person authorization at
// all. This checks a real allowlist table instead: someone is only an
// admin if their user_id was explicitly added to admin_users. Nothing
// self-service adds a row here — RLS on that table has no policies at
// all, so it's only ever readable/writable through the service role,
// same pattern as every other admin-only table in this app.

export async function isAdminUserId(userId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin().from('admin_users').select('user_id').eq('user_id', userId).maybeSingle()
  return !!data
}

// Batched version for call sites checking several people at once (e.g.
// labelling which chat participants are staff) — one query instead of one
// per person.
export async function adminUserIdSet(userIds: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(userIds)).filter(Boolean)
  if (unique.length === 0) return new Set()
  const { data } = await getSupabaseAdmin().from('admin_users').select('user_id').in('user_id', unique)
  return new Set((data || []).map((r: any) => r.user_id))
}
