import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getComplianceStatus } from '@/lib/complianceStatus'
import { sendPropertyComplianceAutoReminderEmail, type ComplianceAutoReminderItem } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { sendSms } from '@/lib/sms'
import { emailAllowed } from '@/lib/notificationPrefs'

export const maxDuration = 60

const PAGE = 500
const CHUNK = 100

// Runs daily (see vercel.json). Fires the landlord's own per-item
// reminder_days threshold (already set from the compliance page, already
// drives the dashboard badge via complianceStatus.ts) through to actual
// email/push/SMS, respecting per-item reminder_channels and the landlord's
// own account-level notification preferences.
//
// last_reminder_status (added alongside reminder_channels, see
// 2026-10-15-compliance-reminder-sending.sql) guards against repeats: a
// reminder only fires again when the computed status actually changes
// (first crossing into "expiring_soon", then again once it actually
// "expired"). The compliance page resets this to null on create/renew, so
// a renewed item is eligible for a fresh reminder next cycle.
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()

  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('compliance_items')
      .select('id, item_type, expiry_date, reminder_days, reminder_channels, last_reminder_status, property_id, properties(address, city, owner_user_id)')
      .not('expiry_date', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('cron/compliance-reminders: query failed', error)
      return NextResponse.json({ error: 'Could not load compliance items' }, { status: 500 })
    }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }

  type DueItem = { id: string; name: string; expiryDate: string; status: 'expiring_soon' | 'expired'; channels: string[] }
  // Grouped per landlord+property, since one email/push/text should cover
  // every item due on that property today, not one send per item.
  const dueByLandlordProperty = new Map<string, { landlordUserId: string; propertyId: string; address: string; items: DueItem[] }>()

  for (const row of rows) {
    const { key: statusKey } = getComplianceStatus(row.expiry_date, row.reminder_days)
    if (statusKey !== 'expiring_soon' && statusKey !== 'expired') continue
    if (row.last_reminder_status === statusKey) continue // already sent for this exact transition

    const property = row.properties
    const landlordUserId = property?.owner_user_id
    if (!landlordUserId) continue

    const mapKey = `${landlordUserId}:${row.property_id}`
    const entry = dueByLandlordProperty.get(mapKey) || {
      landlordUserId,
      propertyId: row.property_id,
      address: property.city ? `${property.address}, ${property.city}` : property.address,
      items: [] as DueItem[],
    }
    entry.items.push({
      id: row.id,
      name: row.item_type,
      expiryDate: row.expiry_date,
      status: statusKey,
      channels: row.reminder_channels || ['email', 'push'],
    })
    dueByLandlordProperty.set(mapKey, entry)
  }

  const landlordIds = Array.from(new Set(Array.from(dueByLandlordProperty.values()).map((e) => e.landlordUserId)))
  const people = new Map<string, { email: string | null; full_name: string | null; phone: string | null; preferred_language: string | null; email_notifications_enabled?: boolean | null; sms_opt_in?: boolean | null }>()
  for (let i = 0; i < landlordIds.length; i += CHUNK) {
    const { data } = await admin
      .from('users')
      .select('id, email, full_name, phone, preferred_language, email_notifications_enabled, sms_opt_in')
      .in('id', landlordIds.slice(i, i + CHUNK))
    for (const u of data || []) people.set(u.id, u)
  }

  let remindersSent = 0
  for (const entry of dueByLandlordProperty.values()) {
    const person = people.get(entry.landlordUserId)
    if (!person) continue
    const lang = person.preferred_language === 'es' ? 'es' : 'en'

    // Channel selection is per item, but items grouped into one send share
    // the same property — union the channels across them so e.g. one item
    // wanting SMS doesn't get silently dropped because another item on the
    // same email only wanted email+push.
    const wantsEmail = entry.items.some((i) => i.channels.includes('email'))
    const wantsPush = entry.items.some((i) => i.channels.includes('push'))
    const wantsSms = entry.items.some((i) => i.channels.includes('sms'))

    let sentAny = false
    const logRows: { notification_type: string; channel: string; recipient_user_id: string; external_id: string | null; resource_type: string; resource_id: string }[] = []

    if (wantsEmail && person.email && emailAllowed(person)) {
      const emailItems: ComplianceAutoReminderItem[] = entry.items.map((i) => ({ name: i.name, expiryDate: i.expiryDate, expired: i.status === 'expired' }))
      const result = await sendPropertyComplianceAutoReminderEmail({
        to: person.email,
        landlordName: person.full_name || 'there',
        propertyAddress: entry.address,
        propertyId: entry.propertyId,
        items: emailItems,
        lang,
      })
      if (result.ok) {
        sentAny = true
        logRows.push({ notification_type: 'compliance_reminder', channel: 'email', recipient_user_id: entry.landlordUserId, external_id: result.id || null, resource_type: 'property_compliance', resource_id: entry.propertyId })
      }
    }

    if (wantsPush) {
      const anyExpired = entry.items.some((i) => i.status === 'expired')
      const pushResult = await sendPush(entry.landlordUserId, {
        title: anyExpired ? 'A compliance item has expired' : 'A compliance item is expiring soon',
        body: entry.items.length === 1 ? `${entry.items[0].name} — ${entry.address}` : `${entry.items.length} items at ${entry.address}`,
        url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord/properties/${entry.propertyId}/compliance`,
      }).catch((err) => { console.error('cron/compliance-reminders: sendPush failed', { landlordUserId: entry.landlordUserId, err }); return null })
      sentAny = true
      // No "delivered"/"opened" signal for push — logged as sent-only, by
      // design (see 2026-10-15-notification-log.sql's comment on why).
      if (pushResult !== null) {
        logRows.push({ notification_type: 'compliance_reminder', channel: 'push', recipient_user_id: entry.landlordUserId, external_id: null, resource_type: 'property_compliance', resource_id: entry.propertyId })
      }
    }

    // Same gating every other SMS type in the app already uses: the
    // landlord's own account-level opt-in and a real phone on file, in
    // addition to this item having asked for SMS specifically.
    if (wantsSms && person.sms_opt_in && person.phone) {
      const anyExpired = entry.items.some((i) => i.status === 'expired')
      const body = entry.items.length === 1
        ? `Prophandld: ${anyExpired ? 'Expired' : 'Expiring soon'}: ${entry.items[0].name} at ${entry.address}.`
        : `Prophandld: ${entry.items.length} compliance items need attention at ${entry.address}.`
      const smsResult = await sendSms(person.phone, body).catch((err) => { console.error('cron/compliance-reminders: sendSms failed', { landlordUserId: entry.landlordUserId, err }); return null })
      if (smsResult?.ok) {
        sentAny = true
        logRows.push({ notification_type: 'compliance_reminder', channel: 'sms', recipient_user_id: entry.landlordUserId, external_id: smsResult.id || null, resource_type: 'property_compliance', resource_id: entry.propertyId })
      }
    }

    if (!sentAny) continue
    remindersSent++

    if (logRows.length > 0) {
      await admin.from('notification_log').insert(logRows).then(({ error }) => {
        if (error) console.error('cron/compliance-reminders: notification_log insert failed', error)
      })
    }

    for (const item of entry.items) {
      await admin.from('compliance_items').update({ last_reminder_status: item.status }).eq('id', item.id)
    }
  }

  return NextResponse.json({ ok: true, itemsChecked: rows.length, remindersSent })
}
