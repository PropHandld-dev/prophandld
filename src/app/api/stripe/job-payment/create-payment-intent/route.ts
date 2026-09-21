import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe, paymentPaidAt } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { bidId } = (await request.json()) as { bidId?: string }
  if (!bidId) {
    return NextResponse.json({ error: 'Missing bidId' }, { status: 400 })
  }

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
  const amount = Number(bid.amount)
  const stripe = getStripe()
  const amountCents = Math.round(amount * 100)

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
        const reusable =
          ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.status) &&
          existing.amount === amountCents &&
          existing.client_secret &&
          existing.transfer_data?.destination === contractorRow.stripe_connect_account_id
        if (reusable) {
          return NextResponse.json({ clientSecret: existing.client_secret, amount })
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
      payment_method_types: ['card', 'us_bank_account'],
      transfer_data: { destination: contractorRow.stripe_connect_account_id },
      metadata: {
        prophandld_type: 'job_payment',
        prophandld_bid_id: bid.id,
      },
    })

    await supabaseAdmin
      .from('bids')
      .update({ stripe_payment_intent_id: paymentIntent.id, payment_status: 'processing' })
      .eq('id', bid.id)

    return NextResponse.json({ clientSecret: paymentIntent.client_secret, amount })
  } catch (err) {
    console.error('job-payment/create-payment-intent: unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
