import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Missing webhook signature' }, { status: 400 })
  }

  const body = await request.text()
  const stripe = getStripe()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('stripe webhook: signature verification failed', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  try {
    switch (event.type) {
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        const status = account.charges_enabled && account.payouts_enabled ? 'active' : 'onboarding'
        const { error } = await supabaseAdmin
          .from('users')
          .update({ stripe_connect_status: status })
          .eq('stripe_connect_account_id', account.id)
        if (error) console.error('stripe webhook: account.updated update failed', error)
        break
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode === 'subscription' && session.subscription) {
          const landlordUserId = session.metadata?.prophandld_landlord_user_id
          const tier = session.metadata?.prophandld_tier
          if (landlordUserId && tier) {
            const { error } = await supabaseAdmin
              .from('landlord_subscriptions')
              .upsert(
                {
                  landlord_user_id: landlordUserId,
                  tier,
                  stripe_subscription_id: session.subscription as string,
                  status: 'active',
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'landlord_user_id' }
              )
            if (error) console.error('stripe webhook: checkout.session.completed upsert failed', error)
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const landlordUserId = subscription.metadata?.prophandld_landlord_user_id
        if (landlordUserId) {
          const status = subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : subscription.status
          const { error } = await supabaseAdmin
            .from('landlord_subscriptions')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('landlord_user_id', landlordUserId)
          if (error) console.error('stripe webhook: customer.subscription.updated failed', error)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const landlordUserId = subscription.metadata?.prophandld_landlord_user_id
        if (landlordUserId) {
          const { error } = await supabaseAdmin
            .from('landlord_subscriptions')
            .update({ tier: 'free', stripe_subscription_id: null, status: 'active', updated_at: new Date().toISOString() })
            .eq('landlord_user_id', landlordUserId)
          if (error) console.error('stripe webhook: customer.subscription.deleted failed', error)
        }
        break
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        const type = paymentIntent.metadata?.prophandld_type

        if (type === 'rent_payment') {
          const rentPaymentId = paymentIntent.metadata?.prophandld_rent_payment_id
          if (rentPaymentId) {
            const { data: rentPayment } = await supabaseAdmin
              .from('rent_payments')
              .select('expected_amount, actual_amount')
              .eq('id', rentPaymentId)
              .maybeSingle()

            const paidSoFar = Number(rentPayment?.actual_amount || 0)
            const newActual = paidSoFar + paymentIntent.amount / 100

            const { error } = await supabaseAdmin
              .from('rent_payments')
              .update({
                actual_amount: newActual,
                paid_date: new Date().toISOString().slice(0, 10),
                payment_method: paymentIntent.payment_method_types?.includes('us_bank_account') ? 'bank' : 'card',
                stripe_status: 'succeeded',
              })
              .eq('id', rentPaymentId)
            if (error) console.error('stripe webhook: rent payment_intent.succeeded failed', error)
          }
        }

        if (type === 'job_payment') {
          const bidId = paymentIntent.metadata?.prophandld_bid_id
          if (bidId) {
            const { error } = await supabaseAdmin
              .from('bids')
              .update({ payment_status: 'paid' })
              .eq('id', bidId)
            if (error) console.error('stripe webhook: job payment_intent.succeeded failed', error)
          }
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        const type = paymentIntent.metadata?.prophandld_type

        if (type === 'rent_payment') {
          const rentPaymentId = paymentIntent.metadata?.prophandld_rent_payment_id
          if (rentPaymentId) {
            await supabaseAdmin
              .from('rent_payments')
              .update({ stripe_status: 'failed' })
              .eq('id', rentPaymentId)
          }
        }
        if (type === 'job_payment') {
          const bidId = paymentIntent.metadata?.prophandld_bid_id
          if (bidId) {
            await supabaseAdmin
              .from('bids')
              .update({ payment_status: 'unpaid' })
              .eq('id', bidId)
          }
        }
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error('stripe webhook: handler error', event.type, err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
