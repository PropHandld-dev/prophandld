import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { createLinkedProfile, mintSessionTokenForEmail, ALL_ROLES } from '@/lib/linkedProfiles'

export const maxDuration = 20

// Adds a linked profile for the currently signed-in person — called from
// the Profile page's "Add a profile" button. Returns a token the client
// immediately exchanges (supabase.auth.verifyOtp) to switch into the new
// profile, same as /api/profiles/switch.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { newRole } = (await request.json().catch(() => ({}))) as { newRole?: string }
  if (!newRole || !ALL_ROLES.includes(newRole as any)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: row } = await admin
    .from('users')
    .select('email, full_name, phone, preferred_language')
    .eq('id', user.id)
    .maybeSingle()

  const email = row?.email || user.email
  if (!email) {
    return NextResponse.json({ error: 'An email is required' }, { status: 400 })
  }

  const result = await createLinkedProfile(admin, {
    fromUserId: user.id,
    fromEmail: email,
    fromFullName: row?.full_name || null,
    fromPhone: row?.phone || null,
    fromPreferredLanguage: row?.preferred_language || null,
    newRole: newRole as any,
  })
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const { data: newAuthUser, error: newAuthUserError } = await admin.auth.admin.getUserById(result.newUserId)
  if (newAuthUserError || !newAuthUser?.user?.email) {
    return NextResponse.json({ ok: true, newUserId: result.newUserId, autoSwitchFailed: true })
  }
  const tokenResult = await mintSessionTokenForEmail(admin, newAuthUser.user.email)
  if ('error' in tokenResult) {
    // The profile was created even though the auto-switch token failed —
    // not worth rolling back for this. The person can still reach it by
    // signing in fresh, or the switcher dropdown will work for them later.
    return NextResponse.json({ ok: true, newUserId: result.newUserId, autoSwitchFailed: true })
  }

  return NextResponse.json({ ok: true, newUserId: result.newUserId, tokenHash: tokenResult.hashedToken })
}
