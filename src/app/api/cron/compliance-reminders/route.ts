import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getComplianceStatus } from '@/lib/complianceStatus'
import { sendPropertyComplianceAutoReminderEmail, type ComplianceAutoReminderItem } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { sendAlertSms } from '@/lib/sms'
import { emailAllowed } from '@/lib/notificationPrefs'
import { notifyLandlordIds } from '@/lib/landlordCoOwners'

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

  const primaryLandlordIds = Array.from(new Set(Array.from(dueByLandlordProperty.values()).map((e) => e.landlordUserId)))

  // Compliance tracking is part of a co-owner's full access too (same
  // promise the invite email itself makes) — expand each primary to
  // include any accepted co-owner before building the recipient list.
  const recipientsByPrimary = new Map<string, string[]>()
  await Promise.all(
    primaryLandlordIds.map(async (id) => {
      recipientsByPrimary.set(id, await notifyLandlordIds(admin, id))
    })
  )
  const landlordIds = Array.from(new Set(Array.from(recipientsByPrimary.values()).flat()))

  const people = new Map<string, { email: string | null; full_name: string | null; phone: string | null; preferred_language: string | null; email_notifications_enabled?: boolean | null; sms_opt_in?: boolean | null }>()
  for (let i = 0; i < landlordIds.length; i += CHUNK) {
    const { data } = await admin
      .from('users')
      .select('id, email, full_name, phone, preferred_language, email_notifications_enabled, sms_opt_in')
      .in('id', landlordIds.slice(i, i + CHUNK))
    for (const u of data || []) people.set(u.id, u)
  }

  // sendPush() is fire-and-forget (used by 15+ call sites that way) and
  // never signals success — it always resolves undefined, whether it
  // actually dispatched a payload or silently no-opped (no subscription,
  // push disabled, etc). Checking its return value can't tell us anything,
  // so to log an honest "sent" row to notification_log we check for a real
  // subscription ourselves, up front, same batching as the people lookup.
  const landlordsWithPush = new Set<string>()
  for (let i = 0; i < landlordIds.length; i += CHUNK) {
    const { data } = await admin
      .from('push_subscriptions')
      .select('user_id')
      .in('user_id', landlordIds.slice(i, i + CHUNK))
    for (const row of data || []) landlordsWithPush.add(row.user_id)
  }

  let remindersSent = 0
  for (const entry of dueByLandlordProperty.values()) {
    const recipientIds = recipientsByPrimary.get(entry.landlordUserId) || [entry.landlordUserId]
    let sentToAnyone = false

    for (const recipientId of recipientIds) {
      const person = people.get(recipientId)
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
          logRows.push({ notification_type: 'compliance_reminder', channel: 'email', recipient_user_id: recipientId, external_id: result.id || null, resource_type: 'property_compliance', resource_id: entry.propertyId })
        }
      }

      if (wantsPush) {
        const anyExpired = entry.items.some((i) => i.status === 'expired')
        await sendPush(recipientId, {
          title: anyExpired ? 'A compliance item has expired' : 'A compliance item is expiring soon',
          body: entry.items.length === 1 ? `${entry.items[0].name} at ${entry.address}` : `${entry.items.length} items at ${entry.address}`,
          url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord/properties/${entry.propertyId}/compliance`,
        }).catch((err) => console.error('cron/compliance-reminders: sendPush failed', { recipientId, err }))
        // Only count/log this as sent when a real subscription exists — no
        // "delivered"/"opened" signal for push either way (see
        // 2026-10-15-notification-log.sql), but a landlord with zero
        // registered devices got nothing, and the admin panel should say so.
        if (landlordsWithPush.has(recipientId)) {
          sentAny = true
          logRows.push({ notification_type: 'compliance_reminder', channel: 'push', recipient_user_id: recipientId, external_id: null, resource_type: 'property_compliance', resource_id: entry.propertyId })
        }
      }

      // Same gating every other SMS type in the app already uses: this
      // recipient's own account-level opt-in and a real phone on file, in
      // addition to this item having asked for SMS specifically.
      if (wantsSms && person.sms_opt_in && person.phone) {
        const anyExpired = entry.items.some((i) => i.status === 'expired')
        const body = entry.items.length === 1
          ? `Prophandld: ${anyExpired ? 'Expired' : 'Expiring soon'}: ${entry.items[0].name} at ${entry.address}.`
          : `Prophandld: ${entry.items.length} compliance items need attention at ${entry.address}.`
        const smsResult = await sendAlertSms(person.phone, body).catch((err) => { console.error('cron/compliance-reminders: sendSms failed', { recipientId, err }); return null })
        if (smsResult?.ok) {
          sentAny = true
          logRows.push({ notification_type: 'compliance_reminder', channel: 'sms', recipient_user_id: recipientId, external_id: smsResult.id || null, resource_type: 'property_compliance', resource_id: entry.propertyId })
        }
      }

      if (sentAny) sentToAnyone = true

      if (logRows.length > 0) {
        await admin.from('notification_log').insert(logRows).then(({ error }) => {
          if (error) console.error('cron/compliance-reminders: notification_log insert failed', error)
        })
      }
    }

    if (!sentToAnyone) continue
    remindersSent++

    for (const item of entry.items) {
      await admin.from('compliance_items').update({ last_reminder_status: item.status }).eq('id', item.id)
    }
  }

  return NextResponse.json({ ok: true, itemsChecked: rows.length, remindersSent })
}
