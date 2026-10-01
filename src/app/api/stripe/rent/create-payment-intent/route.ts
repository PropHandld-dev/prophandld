import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'
import { syncRentPayment } from '@/lib/rentPaymentSync'
import { cardProcessingFee } from '@/lib/cardSurcharge'

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { rentPaymentId, paymentMethod } = (await request.json()) as { rentPaymentId?: string; paymentMethod?: 'bank' | 'card' }
  if (!rentPaymentId) {
    return NextResponse.json({ error: 'Missing rentPaymentId' }, { status: 400 })
  }
  // Anything other than an explicit 'card' choice is treated as 'bank' —
  // the safe default (free to the tenant, no surcharge) if this ever gets
  // called without a method for some reason.
  const method: 'bank' | 'card' = paymentMethod === 'card' ? 'card' : 'bank'

  const supabaseAdmin = getSupabaseAdmin()

  const { data: rentPayment, error: rentPaymentError } = await supabaseAdmin
    .from('rent_payments')
    .select('id, expected_amount, actual_amount, tenancy_id, stripe_payment_intent_id, stripe_status, tenancies(renter_user_id, unit_id, units(property_id, properties(owner_user_id)))')
    .eq('id', rentPaymentId)
    .maybeSingle()

  if (rentPaymentError) {
    console.error('rent/create-payment-intent: error fetching rent payment', rentPaymentError)
    return NextResponse.json({ error: 'Could not load rent payment' }, { status: 500 })
  }

  const tenancy = rentPayment?.tenancies as any
  if (!rentPayment || !tenancy) {
    return NextResponse.json({ error: 'Rent payment not found' }, { status: 404 })
  }

  // The primary tenant or a co-renter on the tenancy may pay: rent is one
  // shared amount for the household, and both see the Pay button.
  let mayPay = tenancy.renter_user_id === user.id
  if (!mayPay) {
    const { data: occupant } = await supabaseAdmin
      .from('tenancy_occupants')
      .select('id')
      .eq('tenancy_id', rentPayment.tenancy_id)
      .eq('renter_user_id', user.id)
      .maybeSingle()
    mayPay = !!occupant
  }
  if (!mayPay) {
    return NextResponse.json({ error: 'Rent payment not found' }, { status: 404 })
  }

  const amountDue = Number(rentPayment.expected_amount) - Number(rentPayment.actual_amount || 0)
  if (amountDue <= 0) {
    return NextResponse.json({ error: 'This month is already paid.' }, { status: 400 })
  }

  const landlordUserId = tenancy.units?.properties?.owner_user_id
  if (!landlordUserId) {
    return NextResponse.json({ error: 'Could not determine landlord' }, { status: 500 })
  }

  const { data: landlordRow } = await supabaseAdmin
    .from('users')
    .select('stripe_connect_account_id, stripe_connect_status, payout_frozen_until')
    .eq('id', landlordUserId)
    .maybeSingle()

  if (!landlordRow?.stripe_connect_account_id || landlordRow.stripe_connect_status !== 'active') {
    return NextResponse.json({ error: "Your landlord hasn't set up rent payouts yet." }, { status: 400 })
  }

  // The landlord's payout bank account was changed in the last 48 hours —
  // routine fraud guard against a phished Stripe dashboard login redirecting
  // rent to a new account. See account.updated in the Stripe webhook.
  if (landlordRow.payout_frozen_until && new Date(landlordRow.payout_frozen_until) > new Date()) {
    return NextResponse.json(
      { error: "Your landlord's payout details recently changed. Payments are paused for 48 hours as a security precaution — please try again shortly." },
      { status: 400 }
    )
  }

  const stripe = getStripe()

  // Bank transfers stay genuinely free to the tenant — Prophandld absorbs
  // that smaller, capped ACH fee itself. A card payment adds Stripe's real
  // processing fee on top as a visible surcharge, and application_fee_amount
  // retains exactly that surcharge for Prophandld, so the landlord still
  // receives the full rent amount either way and the platform stops paying
  // Stripe's cut out of its own pocket on every card payment. Restricting
  // payment_method_types to the one chosen method (rather than offering
  // both on one PaymentIntent) is what makes a method-specific amount
  // possible in the first place — the amount has to be fixed before the
  // PaymentIntent is created, which means the method has to be picked first.
  const surcharge = method === 'card' ? cardProcessingFee(amountDue) : 0
  const chargeAmount = amountDue + surcharge
  const amountCents = Math.round(chargeAmount * 100)
  const applicationFeeCents = method === 'card' ? Math.round(surcharge * 100) : undefined
  const paymentMethodTypes = method === 'card' ? ['card'] : ['us_bank_account']

  // An earlier attempt may still be open, or a bank payment may be clearing.
  // Ask Stripe first so the renter can neither pay twice nor get stuck
  // behind an attempt they walked away from.
  if (rentPayment.stripe_payment_intent_id && ['requires_payment', 'processing'].includes(rentPayment.stripe_status || '')) {
    try {
      const synced = await syncRentPayment(supabaseAdmin, stripe, rentPayment.id)
      if (synced === 'paid' || synced === 'already_paid') {
        return NextResponse.json({ error: 'This month is already paid.', alreadyPaid: true }, { status: 409 })
      }
      if (synced === 'processing') {
        return NextResponse.json(
          { error: 'A bank payment for this month is already clearing. It usually takes 1 to 3 business days.' },
          { status: 400 }
        )
      }

      const existing = await stripe.paymentIntents.retrieve(rentPayment.stripe_payment_intent_id)
      if (existing.status !== 'canceled' && existing.status !== 'succeeded') {
        // Must match on the chosen method too, not just the amount — a
        // stale bank-only intent from a previous attempt is never reusable
        // for a card request (or vice versa), since the amount, the
        // surcharge, and the allowed payment method all move together.
        const reusable =
          ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.status) &&
          existing.amount === amountCents &&
          existing.client_secret &&
          existing.transfer_data?.destination === landlordRow.stripe_connect_account_id &&
          existing.payment_method_types?.length === paymentMethodTypes.length &&
          existing.payment_method_types?.every((t) => paymentMethodTypes.includes(t))
        if (reusable) {
          return NextResponse.json({ clientSecret: existing.client_secret, amount: chargeAmount, baseAmount: amountDue, fee: surcharge })
        }
        await stripe.paymentIntents.cancel(existing.id).catch((err) => {
          console.error('rent/create-payment-intent: could not cancel old intent', err)
        })
      }
    } catch (err) {
      console.error('rent/create-payment-intent: could not check existing intent', err)
    }
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      payment_method_types: paymentMethodTypes,
      transfer_data: { destination: landlordRow.stripe_connect_account_id },
      ...(applicationFeeCents ? { application_fee_amount: applicationFeeCents } : {}),
      metadata: {
        prophandld_type: 'rent_payment',
        prophandld_rent_payment_id: rentPayment.id,
        prophandld_base_amount: amountDue.toFixed(2),
        prophandld_card_surcharge: surcharge.toFixed(2),
      },
    })

    await supabaseAdmin
      .from('rent_payments')
      .update({ stripe_payment_intent_id: paymentIntent.id, stripe_status: 'requires_payment' })
      .eq('id', rentPayment.id)

    return NextResponse.json({ clientSecret: paymentIntent.client_secret, amount: chargeAmount, baseAmount: amountDue, fee: surcharge })
  } catch (err) {
    console.error('rent/create-payment-intent: unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
