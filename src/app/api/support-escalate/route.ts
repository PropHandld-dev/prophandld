import { NextResponse } from 'next/server'
import { sendSupportEscalationEmail, sendSupportConfirmationEmail } from '@/lib/email'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// This form is public, so it must not be usable to email arbitrary people
// on demand. Best-effort limits per visitor and per address (they reset when
// the server instance restarts, which is enough to stop casual abuse).
const WINDOW_MS = 15 * 60 * 1000
const hits = new Map<string, number[]>()
function tooMany(key: string, limit: number) {
  const now = Date.now()
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > limit
}

export async function POST(req: Request) {
  try {
    const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
    if (tooMany(`ip:${ip}`, 3)) {
      return NextResponse.json({ error: 'Too many messages. Please try again in a few minutes.' }, { status: 429 })
    }

    const { email, question } = (await req.json()) as { email: string; question: string }

    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }
    if (typeof question !== 'string' || question.trim().length === 0 || question.length > 2000) {
      return NextResponse.json({ error: 'question required' }, { status: 400 })
    }

    if (tooMany(`email:${email.toLowerCase()}`, 2)) {
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
