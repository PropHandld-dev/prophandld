import { NextResponse } from 'next/server'
import { sendEventInterestAdminEmail, sendEventInterestConfirmationEmail } from '@/lib/email'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { tooManyRequests } from '@/lib/rateLimit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  try {
    const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
    if (await tooManyRequests(`event:ip:${ip}`, 5, 15)) {
      return NextResponse.json({ error: 'Too many requests. Please try again in a few minutes.' }, { status: 429 })
    }

    const { email } = (await req.json()) as { email?: string }
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }

    const normalized = email.trim().toLowerCase()
    const admin = getSupabaseAdmin()
    const { error: insertError } = await admin.from('event_interest').insert({ email: normalized })

    // 23505 = already signed up (unique index on lower(email)) — not an
    // error from the visitor's point of view, they're already on the list.
    if (insertError && insertError.code !== '23505') {
      console.error('event-interest: insert failed', insertError)
      return NextResponse.json({ error: 'Could not save your interest. Please try again.' }, { status: 500 })
    }

    // Awaited (concurrently, not sequentially) rather than fire-and-forget
    // — a serverless function's execution can be torn down the instant its
    // response is sent, which routinely raced these and lost before a
    // matching bug was found and fixed elsewhere in the app (AI usage
    // logging, chat history). A failed send here still doesn't fail the
    // request itself — the visitor's interest is already saved either way.
    await Promise.all([
      insertError ? Promise.resolve() : sendEventInterestAdminEmail({ email: normalized }).catch((err) => console.error('event-interest: admin email failed', err)),
      sendEventInterestConfirmationEmail({ to: normalized }).catch((err) => console.error('event-interest: confirmation email failed', err)),
    ])

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('event-interest error', err)
    return NextResponse.json({ error: err.message || 'Something went wrong' }, { status: 500 })
  }
}
