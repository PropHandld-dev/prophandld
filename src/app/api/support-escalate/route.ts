import { NextResponse } from 'next/server'
import { sendSupportEscalationEmail, sendSupportConfirmationEmail } from '@/lib/email'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  try {
    const { email, question } = (await req.json()) as { email: string; question: string }

    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }
    if (typeof question !== 'string' || question.trim().length === 0 || question.length > 2000) {
      return NextResponse.json({ error: 'question required' }, { status: 400 })
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
