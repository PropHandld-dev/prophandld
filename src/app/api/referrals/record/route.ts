import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Called once, right after a successful signup, same fire-and-log spirit
// as the preferred_language update right next to it in signup/page.tsx —
// a failure here never blocks or unwinds the signup that already
// succeeded. referrerId is the referrer's own user id (doubles as their
// referral code, see scripts/2026-10-28-referral-program.sql); the
// `unique(referred_user_id)` constraint means a user can only ever be
// counted as referred once, so retries/double-calls are harmless.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { referrerId } = (await request.json()) as { referrerId?: string }
  if (!referrerId || !UUID_RE.test(referrerId)) {
    return NextResponse.json({ error: 'Invalid referrerId' }, { status: 400 })
  }
  if (referrerId === user.id) {
    return NextResponse.json({ error: "Can't refer yourself" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: referrerExists } = await admin.from('users').select('id').eq('id', referrerId).maybeSingle()
  if (!referrerExists) {
    return NextResponse.json({ error: 'Unknown referrer' }, { status: 400 })
  }

  const { error } = await admin.from('referrals').insert({ referrer_user_id: referrerId, referred_user_id: user.id })
  if (error) {
    // Most likely the unique(referred_user_id) constraint — this user was
    // already referred by someone (or this route got called twice), not a
    // real failure worth surfacing to the signup flow.
    if (error.code !== '23505') console.error('referrals/record: insert failed', error)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true })
}
