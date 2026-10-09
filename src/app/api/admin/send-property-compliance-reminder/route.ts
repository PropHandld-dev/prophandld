import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { sendPropertyComplianceReminderEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { logAdminAudit } from '@/lib/auditLog'
import { emailAllowed } from '@/lib/notificationPrefs'

// Same manual-nudge pattern as send-compliance-reminder (contractors):
// email + push today, SMS left out until Twilio is confirmed live.
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
    .select('email, full_name, preferred_language, email_notifications_enabled')
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
