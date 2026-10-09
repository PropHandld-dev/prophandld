import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendRentMarkedReceivedEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'

// Tells the renter their landlord manually marked a month's rent as
// received (cash, check, or anything paid outside the app) — the automatic
// Dwolla/Stripe path already notifies both sides via its own webhook/sync;
// this manual path previously notified no one. Fire-and-forget after the
// client-side update, same pattern as review-submitted and
// credential-submitted.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords mark rent received' }, { status: 403 })
  }

  const { rentPaymentId } = (await request.json()) as { rentPaymentId?: string }
  if (!rentPaymentId) {
    return NextResponse.json({ error: 'Missing rentPaymentId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: rent } = await supabaseAdmin
    .from('rent_payments')
    .select('actual_amount, month, tenancies(renter_user_id, units(unit_number, properties(address, owner_user_id)))')
    .eq('id', rentPaymentId)
    .maybeSingle()

  const tenancy = rent?.tenancies as any
  const unit = tenancy?.units
  if (!rent || unit?.properties?.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'Rent payment not found' }, { status: 404 })
  }

  const renterUserId = tenancy?.renter_user_id
  if (!renterUserId) {
    return NextResponse.json({ ok: true })
  }

  const { data: renter } = await supabaseAdmin
    .from('users')
    .select('email, full_name, preferred_language, email_notifications_enabled')
    .eq('id', renterUserId)
    .maybeSingle()

  const monthLabel = rent.month
    ? new Date(rent.month + 'T00:00:00').toLocaleDateString(renter?.preferred_language === 'es' ? 'es' : 'en-US', { month: 'long', year: 'numeric' })
    : 'this month'
  const unitLabel = unit?.properties?.address
    ? `${unit.properties.address}${unit.unit_number ? `, Unit ${unit.unit_number}` : ''}`
    : 'your unit'

  if (renter?.email && emailAllowed(renter)) {
    await sendRentMarkedReceivedEmail({
      to: renter.email,
      renterName: renter.full_name || 'there',
      amount: Number(rent.actual_amount || 0),
      monthLabel,
      unitLabel,
      lang: renter.preferred_language === 'es' ? 'es' : 'en',
    }).catch((err) => console.error('rent/mark-received-notify: email failed', err))
  }

  await sendPush(renterUserId, {
    title: 'Rent marked as paid',
    body: `$${Number(rent.actual_amount || 0).toFixed(2)} for ${monthLabel}`,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/renter/rent`,
  }).catch((err) => console.error('rent/mark-received-notify: sendPush failed', err))

  return NextResponse.json({ ok: true })
}
