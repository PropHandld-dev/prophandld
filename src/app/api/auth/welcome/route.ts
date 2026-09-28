import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendWelcomeEmail } from '@/lib/email'

// Called from /login whenever it thinks someone just activated — but that
// client-side signal turned out not to be trustworthy on its own (Supabase's
// SIGNED_IN vs. INITIAL_SESSION distinction has known real-world
// inconsistencies), and a duplicate call here means a duplicate email, which
// is exactly what got reported: a contractor got "welcome to Prophandld"
// again well after their real first login, and a login that started
// re-sending it on every attempt. So this endpoint no longer trusts the
// caller at all — it's the one place that actually decides "has this
// account been welcomed yet," using an atomic claim on welcomed_at so two
// overlapping calls can't both win and double-send.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const role = user.user_metadata?.role
  if (role !== 'landlord' && role !== 'renter' && role !== 'contractor') {
    return NextResponse.json({ ok: true, sent: false })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Only ever succeeds once per account: this UPDATE affects a row only if
  // welcomed_at was still null, and returns nothing otherwise — no separate
  // read-then-write, so there's no window for two requests to both see
  // "not yet welcomed" and both send.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('users')
    .update({ welcomed_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('welcomed_at', null)
    .select('id')
    .maybeSingle()

  if (claimError) {
    console.error('welcome email: could not claim welcomed_at', claimError)
    return NextResponse.json({ ok: false, sent: false }, { status: 500 })
  }
  if (!claimed) {
    // Zero rows matched .is('welcomed_at', null) — but that's true for two
    // very different reasons that used to get silently conflated: the row
    // exists and was already welcomed (fine, nothing to do), or the
    // public.users row for this brand-new account doesn't exist YET (it's
    // created by a database trigger off auth.users, not by this app, so a
    // request that lands before that trigger has finished loses this race
    // and the welcome email would otherwise just never send, with nothing
    // anywhere to show it failed). Told apart here so the second case is a
    // real, logged, retryable error instead of a silent no-op.
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('users')
      .select('welcomed_at')
      .eq('id', user.id)
      .maybeSingle()
    if (existingError) {
      console.error('welcome email: could not check existing row', existingError)
      return NextResponse.json({ ok: false, sent: false }, { status: 500 })
    }
    if (!existing) {
      console.error('welcome email: public.users row not found yet for', user.id, '(likely still waiting on the auth.users trigger)')
      return NextResponse.json({ ok: false, sent: false, notReady: true }, { status: 409 })
    }
    return NextResponse.json({ ok: true, sent: false, alreadyWelcomed: true })
  }

  const result = await sendWelcomeEmail({
    to: user.email,
    name: user.user_metadata?.full_name,
    role,
    lang: user.user_metadata?.preferred_language === 'es' ? 'es' : 'en',
  })

  if (!result.ok) {
    console.error('welcome email: send failed', result.error)
    return NextResponse.json({ ok: false, sent: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sent: true })
}
