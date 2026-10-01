import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe, paymentPaidAt } from '@/lib/stripe'

export const maxDuration = 15

// Asks Stripe directly whether a job payment went through, and records it.
// The payment_intent.succeeded webhook does the same job, but it can arrive
// a few seconds after the landlord sees "Payment complete" — this lets the
// job page catch up straight away instead of waiting on it.
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
    .select('id, status, payment_status, stripe_payment_intent_id, contractor_user_id, jobs(units(properties(owner_user_id)))')
    .eq('id', bidId)
    .maybeSingle()

  if (bidError) {
    console.error('job-payment/confirm: error fetching bid', bidError)
    return NextResponse.json({ error: 'Could not load job' }, { status: 500 })
  }

  const landlordUserId = (bid?.jobs as any)?.units?.properties?.owner_user_id
  // Either side of the payment may ask: the landlord who paid, or the
  // contractor waiting to see it as earned.
  if (!bid || (landlordUserId !== user.id && bid.contractor_user_id !== user.id)) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (bid.payment_status === 'paid') {
    return NextResponse.json({ status: 'paid' })
  }
  if (!bid.stripe_payment_intent_id) {
    return NextResponse.json({ status: 'unpaid' })
  }

  try {
    const paymentIntent = await getStripe().paymentIntents.retrieve(bid.stripe_payment_intent_id, { expand: ['latest_charge'] })

    // Never trust an intent that doesn't belong to this bid.
    if (paymentIntent.metadata?.prophandld_bid_id !== bid.id) {
      return NextResponse.json({ error: 'Payment does not match this job' }, { status: 400 })
    }

    if (paymentIntent.status === 'succeeded') {
      // Whichever of this route or the payment_intent.succeeded webhook
      // gets here first is the one that actually records the payment (the
      // .neq('payment_status', 'paid') guard is what makes that safe) — so
      // this needs to write the real surcharge too, not just flip the
      // status, or a landlord/contractor whose confirm call happens to win
      // that race would end up with card_surcharge_amount silently left at
      // null despite a real fee having been charged, since the webhook's
      // own idempotency check would then see the row already marked paid
      // and skip entirely rather than fill it in after the fact.
      const cardSurcharge = paymentIntent.metadata?.prophandld_card_surcharge
        ? Number(paymentIntent.metadata.prophandld_card_surcharge)
        : 0
      const { error } = await supabaseAdmin
        .from('bids')
        .update({ payment_status: 'paid', paid_at: paymentPaidAt(paymentIntent), card_surcharge_amount: cardSurcharge })
        .eq('id', bid.id)
        .neq('payment_status', 'paid')
      if (error) {
        console.error('job-payment/confirm: could not mark bid paid', error)
        return NextResponse.json({ error: 'Could not record payment' }, { status: 500 })
      }
      return NextResponse.json({ status: 'paid' })
    }

    return NextResponse.json({ status: paymentIntent.status === 'processing' ? 'processing' : 'unpaid' })
  } catch (err) {
    console.error('job-payment/confirm: unhandled error', err)
    return NextResponse.json({ error: 'Could not check payment' }, { status: 500 })
  }
}
