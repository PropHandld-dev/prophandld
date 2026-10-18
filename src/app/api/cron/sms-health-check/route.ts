import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getTwilioClient } from '@/lib/sms'
import { sendSmsRegistrationErrorAdminEmail } from '@/lib/email'

export const maxDuration = 30

// Runs daily (see vercel.json — Vercel Hobby only allows daily crons, so
// this isn't truly "immediate," but it's a real improvement over the
// status quo: nothing ever re-checked a sent SMS's actual delivery status
// before this. sendAlertSms/sendSms only know whether Twilio *accepted*
// the request, not whether the carrier actually delivered it — exactly
// the blind spot that let every SMS sent before the A2P campaigns were
// approved look "successful" while silently failing with error 30034.
//
// 30034 specifically (and the related registration-class codes below)
// means the whole sending number is misconfigured, not that one message
// had a bad destination — worth a single urgent alert, not a per-message
// one, since by the time this runs it's very likely every SMS sent since
// the last check failed the same way.
const REGISTRATION_ERROR_CODES = new Set([30034, 30032, 30033])

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: rows, error } = await admin
    .from('notification_log')
    .select('id, external_id, sent_at')
    .eq('channel', 'sms')
    .not('external_id', 'is', null)
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('cron/sms-health-check: query failed', error)
    return NextResponse.json({ error: 'Could not load notification log' }, { status: 500 })
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, registrationErrors: 0 })
  }

  const twilio = getTwilioClient()
  const registrationErrors: { sid: string; errorCode: number | null; sentAt: string }[] = []

  for (const row of rows) {
    const message = await twilio.messages(row.external_id!).fetch().catch(() => null)
    if (message?.errorCode && REGISTRATION_ERROR_CODES.has(message.errorCode)) {
      registrationErrors.push({ sid: row.external_id!, errorCode: message.errorCode, sentAt: row.sent_at })
    }
  }

  if (registrationErrors.length > 0) {
    await sendSmsRegistrationErrorAdminEmail({
      affectedCount: registrationErrors.length,
      checkedCount: rows.length,
      sampleSids: registrationErrors.slice(0, 5).map((r) => r.sid),
    }).catch((err) => console.error('cron/sms-health-check: admin alert failed', err))
  }

  return NextResponse.json({ ok: true, checked: rows.length, registrationErrors: registrationErrors.length })
}
