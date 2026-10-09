import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { createLinkedProfile, mintSessionTokenForEmail, ALL_ROLES } from '@/lib/linkedProfiles'

export const maxDuration = 20

// The public signup page's path to the same "add a linked profile" flow —
// for someone who isn't signed in yet and types an email that already
// belongs to an account. Ownership is proven the same way logging in
// proves it: their existing password, checked here before anything is
// created. No separate "is this email registered" check exists anywhere
// in this route — signInWithPassword's own generic failure already covers
// both "no such account" and "wrong password" with one message, so this
// can't be used to enumerate which emails have accounts.
export async function POST(request: NextRequest) {
  const { email, password, newRole } = (await request.json().catch(() => ({}))) as {
    email?: string
    password?: string
    newRole?: string
  }
  if (!email || !password || !newRole || !ALL_ROLES.includes(newRole as any)) {
    return NextResponse.json({ error: 'Missing or invalid details' }, { status: 400 })
  }

  // A throwaway client, never persisted — only used to verify the
  // password, exactly like /login does. Its own session is discarded; the
  // real session handed back to the browser is the new profile's, minted
  // below the same way /api/profiles/switch does it.
  const verifyClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { data: signInData, error: signInError } = await verifyClient.auth.signInWithPassword({ email, password })
  if (signInError || !signInData.user) {
    return NextResponse.json({ error: 'Incorrect password for that email.' }, { status: 401 })
  }

  const existingUserId = signInData.user.id
  const fromRole = signInData.user.app_metadata?.role
  if (!fromRole || !ALL_ROLES.includes(fromRole)) {
    return NextResponse.json({ error: 'Could not determine that account\'s role' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: row } = await admin
    .from('users')
    .select('email, full_name, phone, preferred_language')
    .eq('id', existingUserId)
    .maybeSingle()

  const result = await createLinkedProfile(admin, {
    fromUserId: existingUserId,
    fromRole,
    fromEmail: row?.email || email,
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
    return NextResponse.json({ ok: true, newUserId: result.newUserId, autoSwitchFailed: true })
  }

  return NextResponse.json({ ok: true, newUserId: result.newUserId, tokenHash: tokenResult.hashedToken })
}
