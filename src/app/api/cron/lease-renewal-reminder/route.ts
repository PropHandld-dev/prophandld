import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendLeaseRenewalReminderEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { sendAlertSms } from '@/lib/sms'
import { emailAllowed } from '@/lib/notificationPrefs'
import { notifyLandlordIds } from '@/lib/landlordCoOwners'

export const maxDuration = 60

const REMINDER_DAYS_OUT = 60

// Runs daily (see vercel.json). tenancies.lease_end already existed —
// nothing watched it before this. Claim-once via renewal_reminder_sent_at
// (see scripts/2026-10-28-lease-renewal-reminder.sql): one heads-up per
// tenancy when its lease_end first comes within REMINDER_DAYS_OUT, not a
// repeating nag like the compliance-item reminders.
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const today = new Date()
  const cutoff = new Date(today.getTime() + REMINDER_DAYS_OUT * 24 * 60 * 60 * 1000)
  const todayKey = today.toISOString().slice(0, 10)
  const cutoffKey = cutoff.toISOString().slice(0, 10)

  const { data: tenancies, error } = await admin
    .from('tenancies')
    .select('id, unit_id, renter_user_id, lease_end, units(unit_number, properties(id, address, city, owner_user_id))')
    .eq('ended', false)
    .is('renewal_reminder_sent_at', null)
    .not('lease_end', 'is', null)
    .gte('lease_end', todayKey)
    .lte('lease_end', cutoffKey)

  if (error) {
    console.error('cron/lease-renewal-reminder: query failed', error)
    return NextResponse.json({ error: 'Could not load tenancies' }, { status: 500 })
  }

  let sent = 0
  for (const t of tenancies || []) {
    const unit = (t as any).units
    const property = unit?.properties
    if (!property?.owner_user_id || !t.lease_end) continue

    const daysUntil = Math.round((new Date(t.lease_end + 'T00:00:00').getTime() - today.getTime()) / (24 * 60 * 60 * 1000))

    const [{ data: renter }, recipientIds] = await Promise.all([
      admin.from('users').select('full_name').eq('id', t.renter_user_id).maybeSingle(),
      notifyLandlordIds(admin, property.owner_user_id),
    ])
    const { data: recipients } = await admin
      .from('users')
      .select('id, email, full_name, preferred_language, email_notifications_enabled, phone, sms_opt_in')
      .in('id', recipientIds)

    const address = property.city ? `${property.address}, ${property.city}` : property.address
    const unitLabel = unit?.unit_number ? `${address}, Unit ${unit.unit_number}` : address

    for (const recipient of recipients || []) {
      if (recipient.email && emailAllowed(recipient)) {
        await sendLeaseRenewalReminderEmail({
          to: recipient.email,
          landlordName: recipient.full_name || 'there',
          renterName: renter?.full_name || 'Your tenant',
          propertyAddress: property.address,
          unitNumber: unit?.unit_number || null,
          leaseEnd: t.lease_end,
          daysUntil,
          propertyId: property.id,
          unitId: t.unit_id,
          lang: recipient.preferred_language === 'es' ? 'es' : 'en',
        }).catch((err) => console.error('cron/lease-renewal-reminder: email failed', { tenancyId: t.id, err }))
      }
      await sendPush(recipient.id, {
        title: 'A lease is coming up for renewal',
        body: `${unitLabel} — ends in ${daysUntil} days`,
        url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord/properties/${property.id}/units/${t.unit_id}/tenancy/edit`,
      }).catch((err) => console.error('cron/lease-renewal-reminder: push failed', { tenancyId: t.id, err }))
      if (recipient.sms_opt_in && recipient.phone) {
        const smsResult = await sendAlertSms(
          recipient.phone,
          `Prophandld: Lease at ${unitLabel} ends in ${daysUntil} days. Time to send a renewal or non-renewal notice.`
        ).catch((err) => {
          console.error('cron/lease-renewal-reminder: sms failed', { tenancyId: t.id, err })
          return null
        })
        if (smsResult?.ok) {
          await admin.from('notification_log').insert({
            notification_type: 'lease_renewal_reminder',
            channel: 'sms',
            recipient_user_id: recipient.id,
            external_id: smsResult.id || null,
          })
        }
      }
    }

    await admin.from('tenancies').update({ renewal_reminder_sent_at: new Date().toISOString() }).eq('id', t.id)
    sent++
  }

  return NextResponse.json({ ok: true, sent })
}
