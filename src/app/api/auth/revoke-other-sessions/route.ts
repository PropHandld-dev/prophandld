import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Called right after a password change (see profile/page.tsx
// handleChangePassword) so a session hijacked before the change — a
// stolen-but-still-valid refresh token, a forgotten logged-in device —
// doesn't just keep working indefinitely after the "fix." GoTrue's admin
// signOut takes an access token (not a user id) and scope 'others', which
// revokes every session for that token's account EXCEPT the one the token
// itself belongs to — exactly what's needed here: the caller just
// re-verified their password in handleChangePassword, so their own
// current session should survive, every other one shouldn't.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: { session } } = await authClient.auth.getSession()
  if (!session?.access_token) {
    return NextResponse.json({ error: 'No active session' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const { error } = await admin.auth.admin.signOut(session.access_token, 'others')

  if (error) {
    console.error('revoke-other-sessions: signOut failed', error)
    return NextResponse.json({ error: 'Could not revoke other sessions' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
