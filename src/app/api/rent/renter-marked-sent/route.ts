import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'
import { sendP2pPaymentSentEmail } from '@/lib/email'
import { notifyLandlordIds } from '@/lib/landlordCoOwners'

const METHOD_LABELS: Record<string, string> = { zelle: 'Zelle', venmo: 'Venmo', cashapp: 'Cash App' }

// Not a payment confirmation — the landlord's own "Mark received" stays
// the only thing that actually confirms money arrived, same as cash/check
// today. This just closes the "did they even try" information gap a pure
// "here's my Zelle info" screen would otherwise leave completely silent.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { rentPaymentId, method } = (await request.json().catch(() => ({}))) as { rentPaymentId?: string; method?: string }
  if (!rentPaymentId || !method || !METHOD_LABELS[method]) {
    return NextResponse.json({ error: 'Missing or invalid rentPaymentId/method' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: rentPayment } = await supabaseAdmin
    .from('rent_payments')
    .select('id, expected_amount, actual_amount, tenancy_id, tenancies(renter_user_id, units(unit_number, properties(address, owner_user_id)))')
    .eq('id', rentPaymentId)
    .maybeSingle()

  const tenancy = rentPayment?.tenancies as any
  if (!rentPayment || !tenancy) {
    return NextResponse.json({ error: 'Rent payment not found' }, { status: 404 })
  }

  // The primary tenant or a co-renter on the tenancy may report sending a
  // payment — same authorization shape as the Stripe payment-intent route.
  let mayReport = tenancy.renter_user_id === user.id
  if (!mayReport) {
    const { data: occupant } = await supabaseAdmin
      .from('tenancy_occupants')
      .select('id')
      .eq('tenancy_id', rentPayment.tenancy_id)
      .eq('renter_user_id', user.id)
      .maybeSingle()
    mayReport = !!occupant
  }
  if (!mayReport) {
    return NextResponse.json({ error: 'Rent payment not found' }, { status: 404 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('rent_payments')
    .update({ renter_marked_sent_at: new Date().toISOString(), renter_marked_sent_method: method })
    .eq('id', rentPaymentId)

  if (updateError) {
    console.error('rent/renter-marked-sent: update failed', updateError)
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }

  const ownerId = (tenancy.units as any)?.properties?.owner_user_id
  const unitLabel = `${(tenancy.units as any)?.properties?.address || 'a unit'}${(tenancy.units as any)?.unit_number ? `, Unit ${(tenancy.units as any).unit_number}` : ''}`
  const amount = Number(rentPayment.expected_amount) - Number(rentPayment.actual_amount || 0)
  const [{ data: renterRow }] = await Promise.all([
    supabaseAdmin.from('users').select('full_name').eq('id', user.id).maybeSingle(),
  ])
  const renterName = renterRow?.full_name || 'Your tenant'
  const methodLabel = METHOD_LABELS[method]

  if (ownerId) {
    const landlordIds = await notifyLandlordIds(supabaseAdmin, ownerId)
    const { data: landlords } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name, preferred_language, email_notifications_enabled')
      .in('id', landlordIds)

    await Promise.allSettled(
      (landlords || []).map(async (landlord) => {
        if (landlord.email && emailAllowed(landlord)) {
          await sendP2pPaymentSentEmail({
            to: landlord.email,
            landlordName: landlord.full_name || 'there',
            renterName,
            unitLabel,
            amount,
            methodLabel,
            lang: landlord.preferred_language === 'es' ? 'es' : 'en',
          }).catch((err) => console.error('rent/renter-marked-sent: email failed', err))
        }
        await sendPush(landlord.id, {
          title: `Rent sent via ${methodLabel}`,
          body: `${renterName} marked $${amount.toFixed(2)} as sent via ${methodLabel} for ${unitLabel}. Check your account and mark it received.`,
          url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord/rent`,
        }).catch((err) => console.error('rent/renter-marked-sent: push failed', err))
      })
    )
  }

  return NextResponse.json({ ok: true })
}
