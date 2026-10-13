import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendPasswordResetEmail } from '@/lib/email'
import { SITE_URL } from '@/lib/site'

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
export async function POST(request: NextRequest) {
  const { email } = (await request.json().catch(() => ({}))) as { email?: string }
  if (!email || !email.trim()) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }
  const trimmedEmail = email.trim()

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

  sendPasswordResetEmail({
    to: trimmedEmail,
    code: linkData.properties.email_otp,
    actionLink: linkData.properties.action_link,
    lang: profile?.preferred_language === 'es' ? 'es' : 'en',
  }).catch((err) => console.error('request-password-reset: sendPasswordResetEmail failed', err))

  return NextResponse.json({ ok: true })
}
