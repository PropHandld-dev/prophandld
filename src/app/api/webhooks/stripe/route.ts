import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe, isPayoutReady } from '@/lib/stripe'
import { syncRentPayment } from '@/lib/rentPaymentSync'
import { sendPayoutDetailsChangedEmail } from '@/lib/email'
import { sendJobPaymentNotifications } from '@/lib/jobPaymentNotify'
import { sendRentPaymentReceivedNotifications, sendRentCreditCardRejectedNotifications } from '@/lib/rentPaymentNotify'

export const maxDuration = 30

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
        const status = isPayoutReady(account) ? 'active' : 'onboarding'
        // previous_attributes only lists fields that actually changed in
        // this event — present means Stripe just saw a new or edited
        // payout bank account on this connected account. That's the exact
        // moment a phished Express dashboard login would be exploited, so
        // payouts pause for 48h and the real owner gets an alert — see the
        // payout_frozen_until check in both create-payment-intent routes.
        const previousAttributes = (event.data as { previous_attributes?: Record<string, unknown> }).previous_attributes || {}
        const bankDetailsChanged = 'external_accounts' in previousAttributes
        // Unlike every other branch here, this one had no retry guard at
        // all — a redelivered account.updated event (normal, expected
        // Stripe behavior) would re-extend the freeze window and re-send
        // the "your payout details changed" alert a second time for the
        // same real change. Reading whether the account was already
        // frozen before this update is what distinguishes a genuinely new
        // bank-detail change from a retry of one already in effect.
        let alreadyFrozen = false
        if (bankDetailsChanged) {
          const { data: existing } = await supabaseAdmin
            .from('users')
            .select('payout_frozen_until')
            .eq('stripe_connect_account_id', account.id)
            .maybeSingle()
          alreadyFrozen = !!existing?.payout_frozen_until && new Date(existing.payout_frozen_until) > new Date()
        }
        const updates: Record<string, unknown> = { stripe_connect_status: status }
        if (bankDetailsChanged && !alreadyFrozen) {
          updates.payout_frozen_until = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
        }
        const { data: updatedUser, error } = await supabaseAdmin
          .from('users')
          .update(updates)
          .eq('stripe_connect_account_id', account.id)
          .select('email, full_name, preferred_language')
          .maybeSingle()
        if (error) console.error('stripe webhook: account.updated update failed', error)
        if (bankDetailsChanged && !alreadyFrozen && updatedUser?.email) {
          sendPayoutDetailsChangedEmail({
            to: updatedUser.email,
            name: updatedUser.full_name || 'there',
            lang: updatedUser.preferred_language === 'es' ? 'es' : 'en',
          }).catch((err) => console.error('stripe webhook: payout-changed alert email failed', err))
        }
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
            // One shared, idempotent step: credit cards are refunded, bank and
            // debit payments are applied once even if this event is retried.
            const synced = await syncRentPayment(supabaseAdmin, stripe, rentPaymentId)

            if (synced === 'refunded_credit_card') {
              await sendRentCreditCardRejectedNotifications(supabaseAdmin, {
                rentPaymentId,
                amount: paymentIntent.amount / 100,
              }).catch((err) => console.error('stripe webhook: notification failed', err))
              break
            }

            // 'already_paid' means an earlier call (a prior delivery of this
            // same event, a page poll, etc) already credited and notified
            // for this row — stop here so a Stripe retry never re-sends the
            // "rent paid" email/push/chat message.
            if (synced !== 'paid') break

            // A card payment's PaymentIntent amount includes Prophandld's
            // processing-fee surcharge — never rent itself. Landlord-facing
            // amounts (email, push, the chat receipt) always mean rent, so
            // they read the real rent portion, not the surcharged total.
            // See the matching note in rentPaymentSync.ts.
            const baseAmountPaid = paymentIntent.metadata?.prophandld_base_amount
              ? Number(paymentIntent.metadata.prophandld_base_amount)
              : paymentIntent.amount / 100
            await sendRentPaymentReceivedNotifications(supabaseAdmin, { rentPaymentId, amount: baseAmountPaid }).catch((err) =>
              console.error('stripe webhook: notification failed', err)
            )
          }
        }

        if (type === 'job_payment') {
          const bidId = paymentIntent.metadata?.prophandld_bid_id
          // The contractor's real payout — and what they should ever be
          // told they "got paid" — is always this, not the raw charge
          // amount, which now can include a card surcharge the landlord
          // paid on top. Falls back to the raw amount for any older
          // PaymentIntent created before this metadata existed.
          const baseAmountPaid = paymentIntent.metadata?.prophandld_base_amount
            ? Number(paymentIntent.metadata.prophandld_base_amount)
            : paymentIntent.amount / 100
          const cardSurcharge = paymentIntent.metadata?.prophandld_card_surcharge
            ? Number(paymentIntent.metadata.prophandld_card_surcharge)
            : 0
          if (bidId) {
            const { data: updatedBid, error } = await supabaseAdmin
              .from('bids')
              .update({ payment_status: 'paid', paid_at: new Date().toISOString(), card_surcharge_amount: cardSurcharge })
              .eq('id', bidId)
              .neq('payment_status', 'paid')
              .select('id')
            if (error) console.error('stripe webhook: job payment_intent.succeeded failed', error)

            // Nothing actually changed — the bid was already marked paid by
            // an earlier delivery of this same event (or a prior call), so
            // stop here rather than re-sending the landlord's receipt and
            // the contractor's "you've been paid" email/push on every retry.
            if (!error && (!updatedBid || updatedBid.length === 0)) break

            // Shared with /api/stripe/job-payment/confirm, whichever call
            // actually wins the race to flip payment_status to 'paid' (the
            // .neq('payment_status','paid') guard above is what makes this
            // safe either way).
            await sendJobPaymentNotifications(supabaseAdmin, { bidId, baseAmountPaid, cardSurcharge })
          }
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        const type = paymentIntent.metadata?.prophandld_type

        // A PaymentIntent can see multiple failed confirmation attempts
        // before eventually succeeding, and Stripe doesn't guarantee webhook
        // delivery order — so a late payment_failed for an earlier attempt
        // can arrive after the succeeded event already marked this row
        // paid. Guard the same way every succeeded branch above does
        // (.neq on the paid/succeeded value) and also require this exact
        // PaymentIntent to still be the row's current one, so a stale event
        // for a PI the row has since moved on from can't touch it either.
        if (type === 'rent_payment') {
          const rentPaymentId = paymentIntent.metadata?.prophandld_rent_payment_id
          if (rentPaymentId) {
            const { error } = await supabaseAdmin
              .from('rent_payments')
              .update({ stripe_status: 'failed' })
              .eq('id', rentPaymentId)
              .eq('stripe_payment_intent_id', paymentIntent.id)
              .neq('stripe_status', 'succeeded')
            if (error) console.error('stripe webhook: rent payment_intent.payment_failed failed', error)
          }
        }
        if (type === 'job_payment') {
          const bidId = paymentIntent.metadata?.prophandld_bid_id
          if (bidId) {
            const { error } = await supabaseAdmin
              .from('bids')
              .update({ payment_status: 'unpaid' })
              .eq('id', bidId)
              .eq('stripe_payment_intent_id', paymentIntent.id)
              .neq('payment_status', 'paid')
            if (error) console.error('stripe webhook: job payment_intent.payment_failed failed', error)
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
