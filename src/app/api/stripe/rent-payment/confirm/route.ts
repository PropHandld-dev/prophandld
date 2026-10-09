import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'
import { syncRentPayment } from '@/lib/rentPaymentSync'
import { sendRentPaymentReceivedNotifications, sendRentCreditCardRejectedNotifications } from '@/lib/rentPaymentNotify'

export const maxDuration = 15

// Asks Stripe directly what happened to a rent payment and records it. The
// payment_intent.succeeded webhook does the same, but a bank payment can
// take days to clear and a webhook can arrive late, so the renter's and the
// landlord's pages call this to catch up.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { rentPaymentId } = (await request.json()) as { rentPaymentId?: string }
  if (!rentPaymentId) {
    return NextResponse.json({ error: 'Missing rentPaymentId' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  const { data: rent, error } = await admin
    .from('rent_payments')
    .select('id, tenancy_id, tenancies(renter_user_id, units(properties(owner_user_id)))')
    .eq('id', rentPaymentId)
    .maybeSingle()

  if (error) {
    console.error('rent-payment/confirm: error fetching rent payment', error)
    return NextResponse.json({ error: 'Could not load rent payment' }, { status: 500 })
  }

  const tenancy = rent?.tenancies as any
  const landlordId = tenancy?.units?.properties?.owner_user_id
  let allowed = !!rent && (tenancy?.renter_user_id === user.id || landlordId === user.id)
  if (rent && !allowed) {
    // A co-renter on the tenancy may check too.
    const { data: occupant } = await admin
      .from('tenancy_occupants')
      .select('id')
      .eq('tenancy_id', rent.tenancy_id)
      .eq('renter_user_id', user.id)
      .maybeSingle()
    allowed = !!occupant
  }
  if (!rent || !allowed) {
    return NextResponse.json({ error: 'Rent payment not found' }, { status: 404 })
  }

  try {
    const stripe = getStripe()
    const status = await syncRentPayment(admin, stripe, rent.id)

    // The webhook sends the "rent paid"/"card rejected" notification when
    // IT wins the race to apply a payment — but the renter's own browser
    // calling this route right after a successful charge usually wins
    // instead, and until now that path sent nothing at all. 'paid' and
    // 'refunded_credit_card' are both fresh-transition-only results (see
    // syncRentPayment's status guard), so this can never double-send on a
    // page poll or a retry.
    if (status === 'paid' || status === 'refunded_credit_card') {
      const { data: freshRent } = await admin
        .from('rent_payments')
        .select('stripe_payment_intent_id')
        .eq('id', rent.id)
        .maybeSingle()
      if (freshRent?.stripe_payment_intent_id) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(freshRent.stripe_payment_intent_id)
          if (status === 'paid') {
            const amount = paymentIntent.metadata?.prophandld_base_amount
              ? Number(paymentIntent.metadata.prophandld_base_amount)
              : paymentIntent.amount / 100
            await sendRentPaymentReceivedNotifications(admin, { rentPaymentId: rent.id, amount })
          } else {
            await sendRentCreditCardRejectedNotifications(admin, { rentPaymentId: rent.id, amount: paymentIntent.amount / 100 })
          }
        } catch (notifyErr) {
          console.error('rent-payment/confirm: notification failed', notifyErr)
        }
      }
    }

    return NextResponse.json({ status })
  } catch (err) {
    console.error('rent-payment/confirm: unhandled error', err)
    return NextResponse.json({ error: 'Could not check payment' }, { status: 500 })
  }
}
