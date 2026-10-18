import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getComplianceStatus } from '@/lib/complianceStatus'
import { sendDocumentExpiryReminderEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { sendAlertSms } from '@/lib/sms'
import { emailAllowed } from '@/lib/notificationPrefs'

export const maxDuration = 60

const PAGE = 500
const CHUNK = 100

// Runs daily (see vercel.json). The document twin of
// cron/compliance-reminders — same day-math (getComplianceStatus is
// generic enough to reuse: it just needs an expiry date and a reminder
// lead time), same once-per-status-transition guard via
// last_reminder_status, but driven off document_reminders (a per-viewer
// opt-in, since more than one person can see the same document and each
// sets their own preference) rather than a landlord-only setting.
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()

  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('document_reminders')
      .select('id, user_id, reminder_days, reminder_channels, last_reminder_status, document_id, documents(filename, document_type, expiry_date)')
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('cron/document-reminders: query failed', error)
      return NextResponse.json({ error: 'Could not load document reminders' }, { status: 500 })
    }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }

  const due = rows.filter((row) => {
    const doc = row.documents
    if (!doc?.expiry_date) return false
    const { key } = getComplianceStatus(doc.expiry_date, row.reminder_days)
    if (key !== 'expiring_soon' && key !== 'expired') return false
    return row.last_reminder_status !== key
  })

  if (due.length === 0) {
    return NextResponse.json({ ok: true, remindersChecked: rows.length, remindersSent: 0 })
  }

  const userIds = Array.from(new Set(due.map((r) => r.user_id)))
  const people = new Map<string, { email: string | null; full_name: string | null; phone: string | null; preferred_language: string | null; email_notifications_enabled?: boolean | null; sms_opt_in?: boolean | null }>()
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const { data } = await admin
      .from('users')
      .select('id, email, full_name, phone, preferred_language, email_notifications_enabled, sms_opt_in')
      .in('id', userIds.slice(i, i + CHUNK))
    for (const u of data || []) people.set(u.id, u)
  }
  // Role determines which documents list the email/push link points at —
  // app_metadata.role lives in auth, not the public.users row.
  const roles = new Map<string, string>()
  await Promise.all(
    userIds.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id).catch(() => ({ data: null }) as any)
      roles.set(id, data?.user?.app_metadata?.role || 'landlord')
    })
  )

  // sendPush() is fire-and-forget and never signals success (see the same
  // check in cron/compliance-reminders) — someone who picked push as their
  // only channel but has no registered device would otherwise have this
  // silently marked "sent" and never get a reminder on any channel for
  // this status transition.
  const usersWithPush = new Set<string>()
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const { data } = await admin
      .from('push_subscriptions')
      .select('user_id')
      .in('user_id', userIds.slice(i, i + CHUNK))
    for (const row of data || []) usersWithPush.add(row.user_id)
  }

  let remindersSent = 0
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'

  for (const row of due) {
    const person = people.get(row.user_id)
    if (!person) continue
    const doc = row.documents
    const lang = person.preferred_language === 'es' ? 'es' : 'en'
    const { key: statusKey } = getComplianceStatus(doc.expiry_date, row.reminder_days)
    const expired = statusKey === 'expired'
    const role = roles.get(row.user_id) || 'landlord'
    const ctaUrl = role === 'renter' ? `${siteUrl}/renter/documents` : `${siteUrl}/landlord/properties`
    const docName = doc.document_type || doc.filename

    const channels: string[] = row.reminder_channels || ['email', 'push']
    let sentAny = false

    if (channels.includes('email') && person.email && emailAllowed(person)) {
      const result = await sendDocumentExpiryReminderEmail({
        to: person.email,
        recipientName: person.full_name || 'there',
        documentName: docName,
        expiryDate: doc.expiry_date,
        ctaUrl,
        expired,
        lang,
      })
      if (result.ok) sentAny = true
    }

    if (channels.includes('push')) {
      await sendPush(row.user_id, {
        title: expired ? 'A document has expired' : 'A document is expiring soon',
        body: docName,
        url: ctaUrl,
      }).catch((err) => console.error('cron/document-reminders: sendPush failed', { userId: row.user_id, err }))
      if (usersWithPush.has(row.user_id)) sentAny = true
    }

    if (channels.includes('sms') && person.sms_opt_in && person.phone) {
      const smsResult = await sendAlertSms(person.phone, `Prophandld: ${expired ? 'Expired' : 'Expiring soon'}: ${docName}.`).catch((err) => {
        console.error('cron/document-reminders: sendSms failed', { userId: row.user_id, err })
        return null
      })
      if (smsResult?.ok) {
        sentAny = true
        await admin.from('notification_log').insert({
          notification_type: 'document_reminder',
          channel: 'sms',
          recipient_user_id: row.user_id,
          external_id: smsResult.id || null,
          resource_type: 'document_reminder',
          resource_id: row.id,
        })
      }
    }

    if (!sentAny) continue
    remindersSent++
    await admin.from('document_reminders').update({ last_reminder_status: statusKey }).eq('id', row.id)
  }

  return NextResponse.json({ ok: true, remindersChecked: rows.length, remindersSent })
}
