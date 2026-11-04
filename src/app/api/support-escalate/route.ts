import { NextResponse } from 'next/server'
import { sendSupportEscalationEmail, sendSupportConfirmationEmail } from '@/lib/email'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { tooManyRequests } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  try {
    const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
    if (await tooManyRequests(`ip:${ip}`, 3, 15)) {
      return NextResponse.json({ error: 'Too many messages. Please try again in a few minutes.' }, { status: 429 })
    }

    let body: { email?: string; question?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const { email, question } = body

    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }
    if (typeof question !== 'string' || question.trim().length === 0 || question.length > 2000) {
      return NextResponse.json({ error: 'question required' }, { status: 400 })
    }

    if (await tooManyRequests(`email:${email.toLowerCase()}`, 2, 15)) {
      return NextResponse.json({ error: 'Too many messages. Please try again in a few minutes.' }, { status: 429 })
    }

    // Stored before the email send so the question survives even if
    // Resend has a bad moment — the admin inbox (/admin/support) is now
    // the durable record, email is just the "notice something came in"
    // channel on top of it, not the only place the question lives. Awaited
    // (not fire-and-forget as it was) since that durability promise only
    // holds if this insert actually completes before the response goes
    // out — a serverless function's execution can be torn down the
    // instant it does.
    const { error: storeError } = await getSupabaseAdmin()
      .from('support_escalations')
      .insert({ email: email.toLowerCase(), question: question.trim() })
    if (storeError) console.error('support-escalate: could not store question', storeError)

    const [toAdmin, toAsker] = await Promise.all([
      sendSupportEscalationEmail({ askerEmail: email, question }),
      sendSupportConfirmationEmail({ to: email, question }),
    ])

    if (!toAdmin.ok) {
      console.error('support-escalate: admin email failed', toAdmin.error)
      return NextResponse.json({ error: 'Could not send your question. Please try again.' }, { status: 502 })
    }

    return NextResponse.json({ ok: true, confirmationSent: toAsker.ok })
  } catch (err: any) {
    console.error('support-escalate error', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
