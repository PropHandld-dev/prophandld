import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe, paymentPaidAt } from '@/lib/stripe'
import { cardProcessingFee, achProcessingFee } from '@/lib/cardSurcharge'

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { bidId, paymentMethod } = (await request.json()) as { bidId?: string; paymentMethod?: 'bank' | 'card' }
  if (!bidId) {
    return NextResponse.json({ error: 'Missing bidId' }, { status: 400 })
  }
  // Same safe default as rent: anything other than an explicit 'card'
  // choice is treated as 'bank' — free to the landlord, no surcharge.
  const method: 'bank' | 'card' = paymentMethod === 'card' ? 'card' : 'bank'

  const supabaseAdmin = getSupabaseAdmin()

  const { data: bid, error: bidError } = await supabaseAdmin
    .from('bids')
    .select('id, amount, proposed_amount, status, payment_status, stripe_payment_intent_id, contractor_user_id, job_id, jobs(unit_id, status, units(property_id, properties(owner_user_id)))')
    .eq('id', bidId)
    .maybeSingle()

  if (bidError) {
    console.error('job-payment/create-payment-intent: error fetching bid', bidError)
    return NextResponse.json({ error: 'Could not load job' }, { status: 500 })
  }

  const job = bid?.jobs as any
  const landlordUserId = job?.units?.properties?.owner_user_id

  if (!bid || bid.status !== 'accepted' || !job || landlordUserId !== user.id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (!['completed', 'archived'].includes(job.status)) {
    return NextResponse.json({ error: 'This job is not marked complete yet.' }, { status: 400 })
  }

  if (bid.payment_status === 'paid') {
    return NextResponse.json({ error: 'This job has already been paid.', alreadyPaid: true }, { status: 409 })
  }

  const { data: contractorRow } = await supabaseAdmin
    .from('users')
    .select('stripe_connect_account_id, stripe_connect_status')
    .eq('id', bid.contractor_user_id)
    .maybeSingle()

  if (!contractorRow?.stripe_connect_account_id || contractorRow.stripe_connect_status !== 'active') {
    return NextResponse.json({ error: "This contractor hasn't set up payouts yet." }, { status: 400 })
  }

  // `amount` is the agreed price: approving a price change copies the new
  // number into it. `proposed_amount` is only a request, and keeps its value
  // after a rejection, so it must never be charged.
  //
  // The contractor still receives exactly `amount` either way — "no
  // platform fee, ever" was a promise about their side of this, not about
  // what the landlord's total charge looks like. Unlike rent (where a bank
  // payment stays free and Prophandld absorbs that fee itself), a landlord
  // paying a contractor covers Stripe's real processing fee on top either
  // way, as a visible surcharge shown before they commit — they're already
  // choosing to pay for real work at a price they picked, so this isn't a
  // new barrier the way a fee on rent would be. application_fee_amount
  // retains exactly that surcharge for Prophandld, whichever method is
  // used, rather than the platform absorbing anything out of its own
  // balance on a job payment. Restricting payment_method_types to the one
  // chosen method is what makes a method-specific amount possible — the
  // amount has to be fixed before the PaymentIntent is created, so the
  // method has to be picked first.
  const amount = Number(bid.amount)
  const surcharge = method === 'card' ? cardProcessingFee(amount) : achProcessingFee(amount)
  const chargeAmount = amount + surcharge
  const stripe = getStripe()
  const amountCents = Math.round(chargeAmount * 100)
  const applicationFeeCents = Math.round(surcharge * 100)
  const paymentMethodTypes = method === 'card' ? ['card'] : ['us_bank_account']

  // "processing" is written when a payment window opens, so it can be left
  // over from a window that was closed without paying. Check what Stripe
  // actually has before starting another attempt, so a landlord can neither
  // pay twice nor be stuck after cancelling.
  if (bid.stripe_payment_intent_id) {
    try {
      const existing = await stripe.paymentIntents.retrieve(bid.stripe_payment_intent_id, { expand: ['latest_charge'] })

      if (existing.status === 'succeeded') {
        await supabaseAdmin
          .from('bids')
          .update({ payment_status: 'paid', paid_at: paymentPaidAt(existing) })
          .eq('id', bid.id)
          .neq('payment_status', 'paid')
        return NextResponse.json({ error: 'This job has already been paid.', alreadyPaid: true }, { status: 409 })
      }

      if (existing.status === 'processing') {
        return NextResponse.json(
          { error: 'A bank payment for this job is already clearing. It usually takes 1 to 3 business days.' },
          { status: 400 }
        )
      }

      if (existing.status !== 'canceled') {
        // Must match on the chosen method too, not just the amount — a
        // stale bank-only intent from a previous attempt is never reusable
        // for a card request (or vice versa), since the amount, the
        // surcharge, and the allowed payment method all move together.
        const reusable =
          ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.status) &&
          existing.amount === amountCents &&
          existing.client_secret &&
          existing.transfer_data?.destination === contractorRow.stripe_connect_account_id &&
          existing.payment_method_types?.length === paymentMethodTypes.length &&
          existing.payment_method_types?.every((t) => paymentMethodTypes.includes(t))
        if (reusable) {
          return NextResponse.json({ clientSecret: existing.client_secret, amount: chargeAmount, baseAmount: amount, fee: surcharge })
        }
        // Amount or payee changed since it was created: retire the old one.
        await stripe.paymentIntents.cancel(existing.id).catch((err) => {
          console.error('job-payment/create-payment-intent: could not cancel old intent', err)
        })
      }
    } catch (err) {
      console.error('job-payment/create-payment-intent: could not check existing intent', err)
    }
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      payment_method_types: paymentMethodTypes,
      transfer_data: { destination: contractorRow.stripe_connect_account_id },
      ...(applicationFeeCents ? { application_fee_amount: applicationFeeCents } : {}),
      metadata: {
        prophandld_type: 'job_payment',
        prophandld_bid_id: bid.id,
        prophandld_base_amount: amount.toFixed(2),
        prophandld_card_surcharge: surcharge.toFixed(2),
      },
    })

    await supabaseAdmin
      .from('bids')
      .update({ stripe_payment_intent_id: paymentIntent.id, payment_status: 'processing' })
      .eq('id', bid.id)

    return NextResponse.json({ clientSecret: paymentIntent.client_secret, amount: chargeAmount, baseAmount: amount, fee: surcharge })
  } catch (err) {
    console.error('job-payment/create-payment-intent: unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
