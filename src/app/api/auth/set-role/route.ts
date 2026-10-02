import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

const ALLOWED_ROLES = ['landlord', 'renter', 'contractor'] as const

// Role used to live only in user_metadata, which Supabase lets a signed-in
// user rewrite themselves (supabase.auth.updateUser({ data: { role } })) —
// any renter could self-promote to "contractor" and reach contractor-only
// data/actions server-side, since every role check in the app trusted that
// field. app_metadata is the fix: it's embedded in the same session/JWT so
// every existing server-side read still works unchanged, but it's only
// ever writable through the service role, never by the user themselves.
//
// This route is the one and only way app_metadata.role gets set, called
// once by the signup page right after supabase.auth.signUp() succeeds.
// The "already set" guard is what actually closes the hole: once a role is
// in app_metadata, nothing — including this route — can change it again.
// A freshly created account has no role here yet, which is the only
// legitimate case this ever succeeds for.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (user.app_metadata?.role) {
    return NextResponse.json({ error: 'Role is already set and cannot be changed here.' }, { status: 409 })
  }

  const { role } = (await request.json().catch(() => ({}))) as { role?: string }
  if (!role || !ALLOWED_ROLES.includes(role as any)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
