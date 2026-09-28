import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { isAdminUserId } from '@/lib/adminAccess'

// admin_users has no client-readable RLS policy on purpose (service-role
// only, same as every other admin-only table) — so AdminLayout can't query
// it directly the way the old email-domain check didn't need to. This is
// the one narrow read it's allowed: "is the calling user themself an
// admin", nothing else about the table is exposed.
export async function GET() {
  const authClient = await createClient()
  const { data: { user }, error } = await authClient.auth.getUser()
  if (!user) {
    // Temporary diagnostic field — safe to expose (a viewer only ever
    // learns whether their own request carried a recognizable session),
    // useful for telling "server never saw a session at all" apart from
    // "saw a session, but it's not on the allowlist" while debugging the
    // first real admin login.
    return NextResponse.json({ authorized: false, debugReason: 'no_session', authError: error?.message || null })
  }
  const authorized = await isAdminUserId(user.id)
  return NextResponse.json({ authorized, debugUserId: user.id, debugEmail: user.email })
}
