import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { getResendClient } from '@/lib/email'
import { getTwilioClient } from '@/lib/sms'

export const maxDuration = 30
const RECENT_LIMIT = 50

// Answers exactly what was asked: did the landlord's compliance reminder
// actually go out, and did it land? Email/SMS status is fetched live from
// Resend/Twilio by each row's stored provider id — never mirrored into
// our own DB, so this is always the provider's current, real answer, not
// a snapshot that can drift. Push has no reliable "opened" signal (see
// 2026-10-15-notification-log.sql), so push rows only ever report "sent."
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const admin = getSupabaseAdmin()

  const { data: rows, error } = await admin
    .from('notification_log')
    .select('id, channel, recipient_user_id, external_id, resource_id, sent_at')
    .eq('notification_type', 'compliance_reminder')
    .order('sent_at', { ascending: false })
    .limit(RECENT_LIMIT)

  if (error) {
    console.error('compliance-reminder-log: query failed', error)
    return NextResponse.json({ error: 'Could not load notification log' }, { status: 500 })
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ entries: [] })
  }

  const userIds = Array.from(new Set(rows.map((r) => r.recipient_user_id)))
  const propertyIds = Array.from(new Set(rows.map((r) => r.resource_id).filter(Boolean)))
  const [{ data: people }, { data: properties }] = await Promise.all([
    admin.from('users').select('id, email, full_name').in('id', userIds),
    admin.from('properties').select('id, address, city').in('id', propertyIds),
  ])
  const peopleById = new Map((people || []).map((p: any) => [p.id, p]))
  const propertiesById = new Map((properties || []).map((p: any) => [p.id, p]))

  const resend = getResendClient()
  const twilio = getTwilioClient()

  const entries = await Promise.all(
    rows.map(async (row) => {
      const person = peopleById.get(row.recipient_user_id)
      const property = propertiesById.get(row.resource_id)
      let status = row.channel === 'push' ? 'sent' : 'unknown'

      if (row.channel === 'email' && row.external_id) {
        const result = await resend.emails.get(row.external_id).catch(() => null)
        status = (result?.data as any)?.last_event || 'unknown'
      } else if (row.channel === 'sms' && row.external_id) {
        const message = await twilio.messages(row.external_id).fetch().catch(() => null)
        status = message?.status || 'unknown'
      }

      return {
        id: row.id,
        channel: row.channel,
        sentAt: row.sent_at,
        status,
        landlordName: person?.full_name || person?.email || 'Unknown',
        landlordEmail: person?.email || null,
        propertyAddress: property ? (property.city ? `${property.address}, ${property.city}` : property.address) : 'Unknown property',
      }
    })
  )

  return NextResponse.json({ entries })
}
