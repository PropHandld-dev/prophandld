import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { sendPropertyComplianceReminderEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { sendAlertSms } from '@/lib/sms'
import { logAdminAudit } from '@/lib/auditLog'
import { emailAllowed } from '@/lib/notificationPrefs'
import { notifyLandlordIds } from '@/lib/landlordCoOwners'

// Same manual-nudge pattern as send-compliance-reminder (contractors):
// email, push, and (now that Twilio is confirmed live in production,
// 2026-10-25) text, gated on sms_opt_in + phone same as everywhere else.
export async function POST(request: Request) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { propertyId, items } = await request.json()
  if (!propertyId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'propertyId and items are required' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: property, error: propertyError } = await admin
    .from('properties')
    .select('address, city, owner_user_id')
    .eq('id', propertyId)
    .maybeSingle()
  if (propertyError || !property?.owner_user_id) {
    console.error('send-property-compliance-reminder: property lookup failed', { propertyId, propertyError })
    return NextResponse.json({ error: 'Could not find that property' }, { status: 404 })
  }

  const { data: owner, error: ownerError } = await admin
    .from('users')
    .select('email, full_name, preferred_language, email_notifications_enabled, phone, sms_opt_in')
    .eq('id', property.owner_user_id)
    .maybeSingle()
  if (ownerError || !owner?.email) {
    console.error('send-property-compliance-reminder: owner lookup failed', { propertyId, ownerError })
    return NextResponse.json({ error: 'Could not find the landlord for that property' }, { status: 404 })
  }

  const lang = owner.preferred_language === 'es' ? 'es' : 'en'
  const address = property.city ? `${property.address}, ${property.city}` : property.address

  // Goes to the landlord, not admin@ — not covered by the documented
  // "admin-facing emails stay unconditional" exemption.
  if (emailAllowed(owner)) {
    const result = await sendPropertyComplianceReminderEmail({
      to: owner.email,
      landlordName: owner.full_name || 'there',
      propertyId,
      propertyAddress: address,
      items,
      lang,
    })
    if (!result.ok) {
      return NextResponse.json({ error: 'Email failed to send' }, { status: 500 })
    }
  }

  await sendPush(property.owner_user_id, {
    title: items.length === 1 ? 'A compliance item needs attention' : `${items.length} compliance items need attention`,
    body: address,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord/properties/${propertyId}/compliance`,
  }).catch((err) => console.error('send-property-compliance-reminder: sendPush failed', { propertyId, err }))

  if (owner.sms_opt_in && owner.phone) {
    const smsResult = await sendAlertSms(
      owner.phone,
      `Prophandld: ${items.length === 1 ? 'A compliance item' : `${items.length} compliance items`} at ${address} need${items.length === 1 ? 's' : ''} attention. View: ${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord/properties/${propertyId}/compliance`
    ).catch((err) => {
      console.error('send-property-compliance-reminder: sendAlertSms failed', { propertyId, err })
      return null
    })
    if (smsResult?.ok) {
      await admin.from('notification_log').insert({
        notification_type: 'property_compliance_reminder',
        channel: 'sms',
        recipient_user_id: property.owner_user_id,
        external_id: smsResult.id || null,
      })
    }
  }

  // Best-effort to any accepted co-owner too — compliance tracking is part
  // of their full access. Kept separate from the primary-owner send above,
  // which still fails the request on error (the admin's "did it work"
  // signal); a co-owner's send never blocks that.
  const coOwnerIds = (await notifyLandlordIds(admin, property.owner_user_id)).filter((id) => id !== property.owner_user_id)
  if (coOwnerIds.length > 0) {
    const { data: coOwners } = await admin
      .from('users')
      .select('id, email, full_name, preferred_language, email_notifications_enabled, phone, sms_opt_in')
      .in('id', coOwnerIds)
    for (const coOwner of coOwners || []) {
      if (coOwner.email && emailAllowed(coOwner)) {
        await sendPropertyComplianceReminderEmail({
          to: coOwner.email,
          landlordName: coOwner.full_name || 'there',
          propertyId,
          propertyAddress: address,
          items,
          lang: coOwner.preferred_language === 'es' ? 'es' : 'en',
        }).catch((err) => console.error('send-property-compliance-reminder: co-owner email failed', { propertyId, err }))
      }
      await sendPush(coOwner.id, {
        title: items.length === 1 ? 'A compliance item needs attention' : `${items.length} compliance items need attention`,
        body: address,
        url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord/properties/${propertyId}/compliance`,
      }).catch((err) => console.error('send-property-compliance-reminder: co-owner push failed', { propertyId, err }))
      if (coOwner.sms_opt_in && coOwner.phone) {
        const coOwnerSmsResult = await sendAlertSms(
          coOwner.phone,
          `Prophandld: ${items.length === 1 ? 'A compliance item' : `${items.length} compliance items`} at ${address} need${items.length === 1 ? 's' : ''} attention. View: ${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord/properties/${propertyId}/compliance`
        ).catch((err) => {
          console.error('send-property-compliance-reminder: co-owner sms failed', { propertyId, err })
          return null
        })
        if (coOwnerSmsResult?.ok) {
          await admin.from('notification_log').insert({
            notification_type: 'property_compliance_reminder',
            channel: 'sms',
            recipient_user_id: coOwner.id,
            external_id: coOwnerSmsResult.id || null,
          })
        }
      }
    }
  }

  await logAdminAudit({
    actionType: 'property_compliance_reminder_sent',
    actorUserId: user.id,
    actorEmail: user.email,
    targetUserId: property.owner_user_id,
    targetEmail: owner.email,
    targetRole: 'landlord',
    detail: { propertyId, items },
  })

  return NextResponse.json({ ok: true })
}
