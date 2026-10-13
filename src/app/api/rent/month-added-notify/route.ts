import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendRentDueRenterEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'

// A landlord manually adding a rent entry (handleAddMonth on the unit rent
// page — for a month the auto-generation cron missed, a back-dated charge,
// or an early future month) previously notified no one — confirmed gap,
// a real report asked "will the tenant get notified for any month?" and
// the honest answer was no. The daily cron only ever notifies on a row IT
// creates for the CURRENT month; a landlord-created row for any month
// already exists by the time the cron runs, so it never catches these
// either. Same fire-and-forget pattern as mark-received-notify.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords add rent entries' }, { status: 403 })
  }

  const { rentPaymentId } = (await request.json()) as { rentPaymentId?: string }
  if (!rentPaymentId) {
    return NextResponse.json({ error: 'Missing rentPaymentId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: rent } = await supabaseAdmin
    .from('rent_payments')
    .select('expected_amount, month, tenancies(renter_user_id, units(unit_number, properties(address, owner_user_id)))')
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

  const unitLabel = unit?.properties?.address
    ? `${unit.properties.address}${unit.unit_number ? `, Unit ${unit.unit_number}` : ''}`
    : 'your unit'
  const monthDate = rent.month ? new Date(rent.month + 'T00:00:00') : new Date()
  const monthLabel = monthDate.toLocaleDateString(renter?.preferred_language === 'es' ? 'es' : 'en-US', { month: 'long', year: 'numeric' })

  if (renter?.email && emailAllowed(renter)) {
    await sendRentDueRenterEmail({
      to: renter.email,
      unitLabel,
      amount: Number(rent.expected_amount || 0),
      monthDate,
      lang: renter.preferred_language === 'es' ? 'es' : 'en',
    }).catch((err) => console.error('rent/month-added-notify: email failed', err))
  }

  await sendPush(renterUserId, {
    title: 'Rent due',
    body: `$${Number(rent.expected_amount || 0).toFixed(2)} for ${monthLabel}`,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/renter/rent`,
  }).catch((err) => console.error('rent/month-added-notify: sendPush failed', err))

  return NextResponse.json({ ok: true })
}
