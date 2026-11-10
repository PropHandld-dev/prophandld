import { NextResponse } from 'next/server'
import { sendEarlyAccessAdminEmail, sendEarlyAccessConfirmationEmail } from '@/lib/email'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { tooManyRequests } from '@/lib/rateLimit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  try {
    const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
    if (await tooManyRequests(`early-access:ip:${ip}`, 5, 15)) {
      return NextResponse.json({ error: 'Too many requests. Please try again in a few minutes.' }, { status: 429 })
    }

    const { email } = (await req.json()) as { email?: string }
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }

    const normalized = email.trim().toLowerCase()
    const admin = getSupabaseAdmin()
    const { error: insertError } = await admin.from('event_interest').insert({ email: normalized, interest_type: 'early_access' })

    // 23505 = already on this list (unique index on lower(email), interest_type).
    if (insertError && insertError.code !== '23505') {
      console.error('early-access-interest: insert failed', insertError)
      return NextResponse.json({ error: 'Could not save your interest. Please try again.' }, { status: 500 })
    }

    await Promise.all([
      insertError ? Promise.resolve() : sendEarlyAccessAdminEmail({ email: normalized }).catch((err) => console.error('early-access-interest: admin email failed', err)),
      sendEarlyAccessConfirmationEmail({ to: normalized }).catch((err) => console.error('early-access-interest: confirmation email failed', err)),
    ])

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('early-access-interest error', err)
    return NextResponse.json({ error: err.message || 'Something went wrong' }, { status: 500 })
  }
}
