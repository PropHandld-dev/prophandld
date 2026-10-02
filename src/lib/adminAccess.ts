import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import type { SupabaseClient } from '@supabase/supabase-js'

// Every admin-facing notification (dispute raised, credential to review,
// auto-approval digest, support question) used to go to one hardcoded
// admin@prophandld.com inbox — disconnected from who's actually an
// authorized admin now that that's a real, per-person list. This is the
// shared way any of those notifications reach everyone on it, instead of
// one address nobody's obligated to actually check.
export async function getAdminEmails(): Promise<string[]> {
  const admin = getSupabaseAdmin()
  const { data: rows } = await admin.from('admin_users').select('user_id')
  const ids = (rows || []).map((r: any) => r.user_id)
  if (ids.length === 0) return []
  const { data: people } = await admin.from('users').select('email').in('id', ids)
  return (people || []).map((p: any) => p.email).filter(Boolean)
}

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

// isAdminUserId alone was the full gate on every /api/admin/* route — but
// AdminLayout and /admin/login only ever enforce the MFA (aal2) challenge
// in the browser, on top of that same check. A route that re-implements
// only the admin_users half silently accepts a plain password session
// (aal1) with no MFA cleared at all, reachable by calling the API directly
// and skipping the UI entirely — a leaked password alone would be enough.
// Every /api/admin/* route should gate on this instead of isAdminUserId
// directly. Takes the route's own already-created authClient so this
// doesn't instantiate a second one.
export async function requireAdminAal2(authClient: SupabaseClient, userId: string): Promise<boolean> {
  const isAdmin = await isAdminUserId(userId)
  if (!isAdmin) return false
  const { data: aal } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  return aal?.currentLevel === 'aal2'
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
