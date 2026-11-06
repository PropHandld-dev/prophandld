import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { tooManyRequests } from '@/lib/rateLimit'

export const maxDuration = 15

// SECURITY FIX (found during a pre-launch vulnerability pass, 2026-11-06):
// this had NO rate limit at all on guesses, while the code itself is only
// 6 digits (900,000 possibilities) valid for 10 minutes — completely
// brute-forceable by an unthrottled authenticated caller. Worse than a
// generic OTP brute force: send-code lets you request a code for ANY
// phone number, not just your own, and phone_verified_at is the exact
// control tenancy/link-invite's phone-match auto-link relies on to stop
// someone typing in a stranger's number and getting auto-linked into
// their pending tenancy (see that route's own comment). Without this
// limit, brute-forcing the code was a real path around that control, not
// just a theoretical one. 8 attempts per 10-minute window — comfortably
// more than anyone will ever need to retype a code correctly, nowhere
// close to viable against 900,000 possibilities.
const RATE_LIMIT = 8
const RATE_WINDOW_MINUTES = 10

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (await tooManyRequests(`phone-verify-code:${user.id}`, RATE_LIMIT, RATE_WINDOW_MINUTES)) {
    return NextResponse.json({ error: 'Too many attempts. Request a new code and try again.' }, { status: 429 })
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
