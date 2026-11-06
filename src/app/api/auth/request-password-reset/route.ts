import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendPasswordResetEmail } from '@/lib/email'
import { SITE_URL } from '@/lib/site'
import { tooManyRequests } from '@/lib/rateLimit'

export const maxDuration = 15

// Replaces supabase.auth.resetPasswordForEmail() (Supabase's own default
// email — plain, unbranded, link-only) with a custom one carrying both a
// typed code and a fallback link, mirroring the exact pattern signup
// confirmation already uses successfully. generateLink's email_otp IS the
// code a Supabase-sent recovery email would have shown; this just routes
// it through this app's own styled sendEmail instead of letting Supabase
// send its own.
//
// Never reveals whether an email has an account — same enumeration
// posture resetPasswordForEmail() already had. A missing account or any
// other generateLink failure is logged and still answered with ok:true;
// only a real email actually gets a real email.
//
// SECURITY FIX (found during a pre-launch vulnerability pass, 2026-11-06):
// going straight through generateLink() (the privileged admin API) rather
// than Supabase's own rate-limited public resetPasswordForEmail() meant
// this had NO rate limit of its own — anyone could flood an arbitrary
// victim's inbox with real reset emails (real Resend cost per send, plus
// straightforward harassment), or spray many emails per IP. Limited by
// both IP and target email, same shared cross-instance limiter already
// used on the other enumeration-shaped routes.
const IP_RATE_LIMIT = 8
const EMAIL_RATE_LIMIT = 3
const RATE_WINDOW_MINUTES = 15

export async function POST(request: NextRequest) {
  const { email } = (await request.json().catch(() => ({}))) as { email?: string }
  if (!email || !email.trim()) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }
  const trimmedEmail = email.trim()

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (
    (await tooManyRequests(`pw-reset-ip:${ip}`, IP_RATE_LIMIT, RATE_WINDOW_MINUTES)) ||
    (await tooManyRequests(`pw-reset-email:${trimmedEmail.toLowerCase()}`, EMAIL_RATE_LIMIT, RATE_WINDOW_MINUTES))
  ) {
    // Still ok:true — a rate-limit response must not reveal anything an
    // ordinary response wouldn't, same enumeration posture as everywhere
    // else in this route.
    return NextResponse.json({ ok: true })
  }

  const admin = getSupabaseAdmin()

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: trimmedEmail,
    options: { redirectTo: `${SITE_URL}/reset-password` },
  })

  if (linkError || !linkData?.properties?.email_otp) {
    console.error('request-password-reset: generateLink failed', linkError)
    return NextResponse.json({ ok: true })
  }

  const { data: profile } = await admin
    .from('users')
    .select('preferred_language')
    .eq('id', linkData.user.id)
    .maybeSingle()

  // Awaited, not fire-and-forget — a serverless function's execution can
  // be torn down the instant its response is sent, which this routinely
  // raced and lost (the exact bug confirmed live elsewhere in this app:
  // AI chat history, AI usage logging, a co-owner invite's notifications).
  // This one is the worst version of it: a locked-out user would silently
  // never get their reset email, with no error shown to them by design
  // (the ok:true below is deliberate, to not reveal whether an email has
  // an account), so there'd be no sign anything had gone wrong at all.
  await sendPasswordResetEmail({
    to: trimmedEmail,
    code: linkData.properties.email_otp,
    actionLink: linkData.properties.action_link,
    lang: profile?.preferred_language === 'es' ? 'es' : 'en',
  }).catch((err) => console.error('request-password-reset: sendPasswordResetEmail failed', err))

  return NextResponse.json({ ok: true })
}
