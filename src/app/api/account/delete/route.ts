import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { deleteAccountCascade } from '@/lib/deleteAccount'

// Self-service account deletion. The actual cascade (delete what the
// account itself owns, in FK-safe order, then the auth user) lives in
// lib/deleteAccount.ts — shared with the admin-driven cleanup route for a
// leftover linked-profile test account, so there's exactly one copy of
// this logic to keep correct.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const result = await deleteAccountCascade(supabaseAdmin, user.id, user.app_metadata?.role, {
    actorEmail: user.email,
    targetEmail: user.email,
    detail: { self_deleted: true },
  })

  if (!result.ok) {
    // A foreign-key-violation message names real table/constraint
    // internals — meaningful for debugging, not for the person who just
    // clicked "Delete account" and has no way to act on it. Full detail
    // stays in the server log inside deleteAccountCascade either way.
    return NextResponse.json(
      { error: `${result.error} Contact admin@prophandld.com and we'll clear it manually.` },
      { status: result.status }
    )
  }

  return NextResponse.json({ ok: true })
}
