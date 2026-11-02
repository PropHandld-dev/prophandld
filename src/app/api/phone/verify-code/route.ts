import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 15

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { code } = (await request.json().catch(() => ({}))) as { code?: string }
  if (!code?.trim()) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  const { data: row, error } = await admin
    .from('phone_verification_codes')
    .select('code, phone, expires_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !row) {
    return NextResponse.json({ error: 'No pending code. Request a new one' }, { status: 400 })
  }
  if (new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: 'That code expired. Request a new one' }, { status: 400 })
  }
  if (row.code !== code.trim()) {
    return NextResponse.json({ error: 'That code didn\'t match' }, { status: 400 })
  }

  // Also write the just-verified number into users.phone, in case it
  // differs from what was already saved (verifying a freshly-typed
  // number before the profile form itself has been saved) — the
  // clear-on-change trigger would otherwise immediately invalidate this
  // same verification the moment the profile form saves normally.
  const { error: updateError } = await admin
    .from('users')
    .update({ phone: row.phone, phone_verified_at: new Date().toISOString() })
    .eq('id', user.id)

  if (updateError) {
    console.error('phone/verify-code: update failed', updateError)
    return NextResponse.json({ error: 'Could not confirm verification' }, { status: 500 })
  }

  // Keep auth user_metadata.phone (what the profile form reads on load)
  // in sync with users.phone (what just got verified) — the profile
  // page's "verified" check compares the two, and the two had been
  // drifting apart whenever someone verified a freshly-typed number
  // without separately hitting "Save profile" first.
  await admin.auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, phone: row.phone } })

  await admin.from('phone_verification_codes').delete().eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
