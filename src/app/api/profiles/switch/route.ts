import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { mintSessionTokenForEmail } from '@/lib/linkedProfiles'

export const maxDuration = 15

// Swaps the active session to another of the signed-in person's own
// linked profiles. The linked_group_id match below is the entire security
// boundary here — it's what stops anyone from switching into an account
// that isn't actually theirs, so it has to run server-side against the
// database, never trusted from anything the client sends about itself.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { targetUserId } = (await request.json().catch(() => ({}))) as { targetUserId?: string }
  if (!targetUserId) {
    return NextResponse.json({ error: 'Missing targetUserId' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const [{ data: self }, { data: target }] = await Promise.all([
    admin.from('users').select('linked_group_id').eq('id', user.id).maybeSingle(),
    admin.from('users').select('id, linked_group_id, role').eq('id', targetUserId).maybeSingle(),
  ])

  if (!self?.linked_group_id || !target || target.linked_group_id !== self.linked_group_id) {
    console.error('profiles/switch: linked_group_id mismatch or missing', { userId: user.id, targetUserId })
    return NextResponse.json({ error: 'That profile is not linked to your account' }, { status: 403 })
  }

  // public.users.email is the person's real contact address (the same
  // value across every one of their linked profiles, on purpose, so
  // notifications always land in one inbox) — not the per-profile alias
  // auth.users.email that generateLink needs to find the right account.
  const { data: targetAuth, error: targetAuthError } = await admin.auth.admin.getUserById(targetUserId)
  if (targetAuthError || !targetAuth?.user?.email) {
    console.error('profiles/switch: could not load target auth user', targetAuthError)
    return NextResponse.json({ error: 'Could not switch profiles' }, { status: 500 })
  }

  const tokenResult = await mintSessionTokenForEmail(admin, targetAuth.user.email)
  if ('error' in tokenResult) {
    return NextResponse.json({ error: tokenResult.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, tokenHash: tokenResult.hashedToken, role: target.role })
}
