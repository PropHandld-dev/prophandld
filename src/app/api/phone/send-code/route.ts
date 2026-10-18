import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendSms } from '@/lib/sms'
import { toE164 } from '@/lib/phoneFormat'

export const maxDuration = 15

// Sends a 6-digit code to verify a phone number before SMS alerts can be
// turned on — same algorithm/shape as the password-reset and signup
// email codes elsewhere in the app, just over SMS instead of email.
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60_000
const hits = new Map<string, number[]>()

function rateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k)
  }
  return recent.length > RATE_LIMIT
}

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (rateLimited(user.id)) {
    return NextResponse.json({ error: 'Too many attempts, try again shortly' }, { status: 429 })
  }

  const { phone } = (await request.json().catch(() => ({}))) as { phone?: string }
  if (!phone?.trim()) {
    return NextResponse.json({ error: 'Missing phone number' }, { status: 400 })
  }
  const e164 = toE164(phone)
  if (!e164) {
    return NextResponse.json({ error: 'That doesn\'t look like a valid US phone number' }, { status: 400 })
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const admin = getSupabaseAdmin()

  const { error: upsertError } = await admin
    .from('phone_verification_codes')
    .upsert({ user_id: user.id, phone: phone.trim(), code, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() })

  if (upsertError) {
    console.error('phone/send-code: upsert failed', upsertError)
    return NextResponse.json({ error: 'Could not send a code right now' }, { status: 500 })
  }

  const result = await sendSms(e164, `Your Prophandld verification code is ${code}. It expires in 10 minutes.`)
  if (!result.ok) {
    console.error('phone/send-code: sendSms failed', result)
    return NextResponse.json({ error: 'Could not send the code. Check the number and try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
