import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/auth'

export const maxDuration = 20

// Confirms the caller's own current password without touching their real
// session — see /api/profiles/add-with-password for the same
// never-persisted verifyClient pattern. This exists specifically because
// calling supabase.auth.signInWithPassword() directly on the browser's own
// client overwrites its session via _saveSession, dropping it back to
// aal1 even if it was aal2 — which breaks any aal2-gated action performed
// right after (e.g. TwoFactorAuthCard's disable flow, which needs aal2 to
// unenroll a verified factor). Routing the check through here instead
// keeps the browser's session, and its AAL, untouched.
export async function POST(request: NextRequest) {
  const { password } = (await request.json().catch(() => ({}))) as { password?: string }
  if (!password) {
    return NextResponse.json({ valid: false }, { status: 400 })
  }

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  const email = user?.email
  if (!email) {
    return NextResponse.json({ valid: false }, { status: 401 })
  }

  const verifyClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { error: signInError } = await verifyClient.auth.signInWithPassword({ email, password })

  return NextResponse.json({ valid: !signInError })
}
