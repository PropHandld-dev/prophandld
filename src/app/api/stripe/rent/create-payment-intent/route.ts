import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'
import { getProviderAdapter } from '@/lib/payments'
import { syncRentPayment } from '@/lib/rentPaymentSync'
import { achProcessingFee, rentCardFee } from '@/lib/cardSurcharge'
import { isAchFeeAbsorbed } from '@/lib/appSettings'
import { resolveRentPayee } from '@/lib/rentRouting'
import { hasBlockingComplianceIssue } from '@/lib/complianceGate'
import { friendlyStripeError } from '@/lib/stripeErrorMessage'

export const maxDuration = 20

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Stripe ACH is the only bank-transfer rail for rent.
  const { rentPaymentId, paymentMethod } = (await request.json()) as { rentPaymentId?: string; paymentMethod?: 'bank' | 'card' }
  if (!rentPaymentId) {
    return NextResponse.json({ error: 'Missing rentPaymentId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: rentPayment, error: rentPaymentError } = await supabaseAdmin
    .from('rent_payments')
    .select('id, expected_amount, actual_amount, tenancy_id, stripe_payment_intent_id, stripe_status, stripe_account_id, tenancies(renter_user_id, unit_id, units(property_id, properties(owner_user_id)))')
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

  // A lapsed rental license past its 15-day grace period means the
  // landlord legally cannot collect rent at all under the Safe Healthy
  // Homes law — not just a late-fee question, a genuine "don't charge
  // this" gate. See complianceGate.ts.
  const propertyId = tenancy.units?.property_id
  if (propertyId && (await hasBlockingComplianceIssue(supabaseAdmin, propertyId))) {
    return NextResponse.json(
      { error: "This property's rental license has lapsed, so rent can't be collected right now. Contact your landlord." },
      { status: 400 }
    )
  }

  // Rent goes to the owner, or to their PM when the owner approved it and
  // the PM is licensed, trust-account attested and set up (rentRouting.ts).
  const payee = await resolveRentPayee(supabaseAdmin, landlordUserId)
  const landlordRow = {
    stripe_connect_account_id: payee.stripeAccountId,
    stripe_connect_status: payee.stripeStatus,
    payout_frozen_until: payee.payoutFrozenUntil,
    ach_provider: payee.achProvider,
  }

  const { data: payeePrefs } = await supabaseAdmin.from('users').select('rent_accept_bank, rent_accept_card').eq('id', payee.userId).maybeSingle()
  if ((paymentMethod === 'card' && payeePrefs?.rent_accept_card === false) || (paymentMethod !== 'card' && payeePrefs?.rent_accept_bank === false)) {
    return NextResponse.json({ error: 'Your landlord doesn\'t accept that payment method. Choose another option.' }, { status: 400 })
  }

  if (!landlordRow.stripe_connect_account_id || landlordRow.stripe_connect_status !== 'active') {
    return NextResponse.json({ error: "Your landlord hasn't set up rent payouts yet." }, { status: 400 })
  }

  // The landlord's payout bank account was changed in the last 48 hours —
  // routine fraud guard against a phished Stripe dashboard login redirecting
  // rent to a new account. See account.updated in the Stripe webhook.
  if (landlordRow.payout_frozen_until && new Date(landlordRow.payout_frozen_until) > new Date()) {
    return NextResponse.json(
      { error: "Your landlord's payout details recently changed. Payments are paused for 48 hours as a security precaution, please try again shortly." },
      { status: 400 }
    )
  }

  const connectedAccountId = landlordRow.stripe_connect_account_id
  const adapter = getProviderAdapter((landlordRow.ach_provider as 'stripe' | 'dwolla') || 'stripe')
  // accounts.retrieve/accountLinks and the idempotency-check retrieve below
  // still go through plain Stripe directly — those are platform-level or
  // read-only calls, not part of the provider-swappable charge path itself.
  const stripe = getStripe()

  // Stripe takes its processing fee from the landlord's own account. Bank
  // transfer: Prophandld pays it back to the landlord once the payment
  // clears (rentPaymentSync), so the tenant pays exactly the rent.
  // isAchFeeAbsorbed covers the per-landlord exception.
  const absorbed = paymentMethod === 'bank' ? await isAchFeeAbsorbed(supabaseAdmin, landlordUserId) : false
  const realAchFee = paymentMethod === 'bank' ? achProcessingFee(amountDue) : 0
  const surcharge = absorbed ? 0 : realAchFee
  const absorbedFeeAmount = absorbed ? realAchFee : 0

  // Card: the tenant pays the card processing fee (rentCardFee). It stays
  // with the landlord, where it covers Stripe's fee on the charge.
  const cardFee = paymentMethod === 'card' ? rentCardFee(amountDue) : 0
  const tenantFee = surcharge + cardFee
  const chargeAmount = Math.round((amountDue + tenantFee) * 100) / 100
  const amountCents = Math.round(chargeAmount * 100)
  // Prophandld keeps nothing from rent.
  const applicationFeeCents = 0
  const paymentMethodTypes = paymentMethod === 'bank' ? ['us_bank_account'] : ['card']

  // An earlier attempt may still be open, or a bank payment may be clearing.
  // Ask Stripe first so the renter can neither pay twice nor get stuck
  // behind an attempt they walked away from.
  if (rentPayment.stripe_payment_intent_id && ['requires_payment', 'processing'].includes(rentPayment.stripe_status || '')) {
    try {
      const previousAccountId = (rentPayment as any).stripe_account_id || connectedAccountId
      const synced = await syncRentPayment(supabaseAdmin, stripe, rentPayment.id, previousAccountId)
      if (synced === 'paid' || synced === 'already_paid') {
        return NextResponse.json({ error: 'This month is already paid.', alreadyPaid: true }, { status: 409 })
      }
      if (synced === 'processing') {
        return NextResponse.json(
          { error: 'A bank payment for this month is already clearing. It usually takes 1 to 3 business days.' },
          { status: 400 }
        )
      }

      // Direct-charge PaymentIntents live on the connected account, not the
      // platform — retrieving one needs that account's context too.
      const existing = await stripe.paymentIntents.retrieve(rentPayment.stripe_payment_intent_id, undefined, { stripeAccount: previousAccountId })
      if (existing.status !== 'canceled' && existing.status !== 'succeeded') {
        // Must match on the chosen method too, not just the amount — a
        // stale bank-only intent from a previous attempt is never reusable
        // for a card request (or vice versa), since the amount, the
        // surcharge, and the allowed payment method all move together.
        const reusable =
          ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.status) &&
          existing.amount === amountCents &&
          existing.client_secret &&
          previousAccountId === connectedAccountId &&
          existing.payment_method_types?.length === paymentMethodTypes.length &&
          existing.payment_method_types?.every((t) => paymentMethodTypes.includes(t))
        if (reusable) {
          return NextResponse.json({ clientSecret: existing.client_secret, amount: chargeAmount, baseAmount: amountDue, fee: tenantFee, connectedAccountId })
        }
        await stripe.paymentIntents.cancel(existing.id, undefined, { stripeAccount: previousAccountId }).catch((err) => {
          console.error('rent/create-payment-intent: could not cancel old intent', err)
        })
      }
    } catch (err) {
      console.error('rent/create-payment-intent: could not check existing intent', err)
    }
  }

  try {
    const charge = await adapter.createDirectCharge({
      amountCents,
      connectedAccountId,
      applicationFeeCents,
      paymentMethodTypes,
      metadata: {
        prophandld_type: 'rent_payment',
        prophandld_rent_payment_id: rentPayment.id,
        prophandld_base_amount: amountDue.toFixed(2),
        prophandld_card_surcharge: tenantFee.toFixed(2),
        prophandld_absorbed_fee: absorbedFeeAmount.toFixed(2),
      },
    })

    await supabaseAdmin
      .from('rent_payments')
      .update({
        stripe_payment_intent_id: charge.providerChargeId,
        stripe_status: 'requires_payment',
        provider: landlordRow.ach_provider || 'stripe',
        absorbed_fee_amount: absorbedFeeAmount || null,
        stripe_account_id: connectedAccountId,
        paid_to: payee.side,
        paid_to_org_id: payee.orgId,
      })
      .eq('id', rentPayment.id)

    return NextResponse.json({ clientSecret: charge.clientSecret, amount: chargeAmount, baseAmount: amountDue, fee: tenantFee, connectedAccountId })
  } catch (err) {
    console.error('rent/create-payment-intent: unhandled error', err)
    return NextResponse.json({ error: friendlyStripeError(err, 'start that payment') }, { status: 500 })
  }
}
