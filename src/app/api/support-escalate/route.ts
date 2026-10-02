import { NextResponse } from 'next/server'
import { sendSupportEscalationEmail, sendSupportConfirmationEmail } from '@/lib/email'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// This form is public, so it must not be usable to email arbitrary people
// on demand. Used to be an in-memory Map, which doesn't actually limit
// anything on Vercel — serverless functions scale across many instances,
// each with its own empty Map, so a burst of concurrent requests (or just
// bad luck landing on a fresh instance) sailed straight through. A shared
// table is the fix: every instance sees the same hit history.
const WINDOW_MS = 15 * 60 * 1000
async function tooMany(key: string, limit: number) {
  const admin = getSupabaseAdmin()
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString()
  // Best-effort row-level housekeeping, same spirit as the old Map's
  // "clear everything past 5000 keys" — keeps this table from growing
  // unbounded on an endpoint that's deliberately public and abuse-prone.
  admin.from('support_escalate_hits').delete().lt('created_at', windowStart).then(() => {})
  const { count } = await admin
    .from('support_escalate_hits')
    .select('id', { count: 'exact', head: true })
    .eq('rate_key', key)
    .gte('created_at', windowStart)
  await admin.from('support_escalate_hits').insert({ rate_key: key })
  return (count || 0) >= limit
}

export async function POST(req: Request) {
  try {
    const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
    if (await tooMany(`ip:${ip}`, 3)) {
      return NextResponse.json({ error: 'Too many messages. Please try again in a few minutes.' }, { status: 429 })
    }

    const { email, question } = (await req.json()) as { email: string; question: string }

    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }
    if (typeof question !== 'string' || question.trim().length === 0 || question.length > 2000) {
      return NextResponse.json({ error: 'question required' }, { status: 400 })
    }

    if (await tooMany(`email:${email.toLowerCase()}`, 2)) {
      return NextResponse.json({ error: 'Too many messages. Please try again in a few minutes.' }, { status: 429 })
    }

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
    return NextResponse.json({ error: err.message || 'Something went wrong' }, { status: 500 })
  }
}
