import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe, isPayoutReady } from '@/lib/stripe'
import { syncRentPayment } from '@/lib/rentPaymentSync'
import { sendPayoutDetailsChangedEmail, sendDuplicateLandlordBankAccountAdminEmail } from '@/lib/email'
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
          .select('id, email, full_name, preferred_language')
          .maybeSingle()
        if (error) console.error('stripe webhook: account.updated update failed', error)
        if (bankDetailsChanged && !alreadyFrozen && updatedUser?.email) {
          // Awaited, not fire-and-forget — same reason as the
          // duplicate-bank-account check just below: the handler's 200 to
          // Stripe comes right after this switch statement, which routinely
          // raced (and lost to) an un-awaited promise like this one. This
          // is the actual security alert telling a landlord their payout
          // account changed, so it mattered more than most to actually fix.
          await sendPayoutDetailsChangedEmail({
            to: updatedUser.email,
            name: updatedUser.full_name || 'there',
            lang: updatedUser.preferred_language === 'es' ? 'es' : 'en',
          }).catch((err) => console.error('stripe webhook: payout-changed alert email failed', err))
        }
        // The other half of the free-tier-loophole fix (see
        // check-landlord-phone/route.ts): Stripe's hosted Express
        // onboarding collects the actual bank account directly, never
        // through our server, so this is the only point we can ever learn
        // what bank account is really behind a landlord's payouts. Every
        // bank account gets a Stripe-assigned `fingerprint` that's
        // identical across connected accounts when it's genuinely the
        // same real bank account — two different "landlord" signups
        // paying out to the same fingerprint is exactly the signal this
        // loophole produces. This only flags for admin review (via
        // sendDuplicateLandlordBankAccountAdminEmail) — billing isn't
        // enforced yet (NEXT_PUBLIC_BILLING_ENFORCE is off until launch),
        // and an automatic hard block here could strand real rent a
        // legitimate landlord is mid-collecting.
        if (bankDetailsChanged && updatedUser?.id) {
          // Awaited, not fire-and-forget — the handler returns its 200 to
          // Stripe right after this switch statement, and a serverless
          // function's execution can be torn down the instant that response
          // is sent. This fraud check (and the admin alert it can send) was
          // very likely never actually completing in production as a
          // result, same bug found and fixed in AI usage logging and chat
          // history elsewhere in this app. Its own try/catch keeps a
          // failure here from turning an otherwise-successful webhook into
          // a 500 that makes Stripe retry the whole event.
          try {
            await checkDuplicateLandlordBankAccount(stripe, supabaseAdmin, account.id, updatedUser.id, updatedUser.email, updatedUser.full_name)
          } catch (err) {
            console.error('stripe webhook: duplicate-bank-account check failed', err)
          }
        }
        break
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode === 'subscription' && session.subscription && session.metadata?.prophandld_type === 'ai_assist') {
          // AI Assist's own dedicated subscription, created via the
          // card-not-on-file branch of ai-assist/start-trial/route.ts — the
          // direct stripe.subscriptions.create() branch inserts its own row
          // immediately instead of waiting on this event, so this only
          // fires for landlords who went through hosted Checkout.
          const landlordUserId = session.metadata?.prophandld_landlord_user_id
          if (landlordUserId) {
            // Status is read from the real subscription rather than
            // hardcoded 'trialing' — a restart after a prior cancellation
            // (start-trial/route.ts skips trial_period_days there) comes
            // back 'active', charged immediately, not trialing. A plain
            // upsert (not ignoreDuplicates) so a restart's existing
            // 'canceled' row actually gets overwritten instead of silently
            // left as-is because a row with that landlord_user_id already
            // existed.
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
            const status = subscription.status === 'active' ? 'active' : 'trialing'
            const { error } = await supabaseAdmin.from('ai_assist_subscriptions').upsert(
              {
                landlord_user_id: landlordUserId,
                status,
                trial_started_at: new Date().toISOString(),
                stripe_subscription_id: session.subscription as string,
                cancel_at_period_end: false,
                current_period_end: null,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'landlord_user_id' }
            )
            if (error) console.error('stripe webhook: ai_assist checkout.session.completed upsert failed', error)
          }
          break
        }
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
        if (landlordUserId && subscription.metadata?.prophandld_type === 'ai_assist') {
          // Stripe's own status values map directly onto our check
          // constraint except 'trialing'/'active' both already match —
          // anything else (past_due, unpaid, incomplete_expired) collapses
          // to past_due, close enough for a v1 that isn't enforced yet.
          const status =
            subscription.status === 'active' || subscription.status === 'trialing'
              ? subscription.status
              : subscription.status === 'canceled'
                ? 'canceled'
                : 'past_due'
          // Keeps cancel_at_period_end/current_period_end accurate beyond
          // just the app's own cancel route — e.g. if it's ever changed
          // from the Stripe dashboard directly.
          const periodEnd = subscription.items.data[0]?.current_period_end
          // Scoped to this exact subscription id, not just the landlord —
          // a delayed/retried event for a subscription this landlord's row
          // has since moved on from (a restart replaced it, or an admin
          // free_forever grant cancelled it outright) must not stomp
          // whatever the row's current, newer state actually is.
          const { error } = await supabaseAdmin
            .from('ai_assist_subscriptions')
            .update({
              status,
              cancel_at_period_end: subscription.cancel_at_period_end,
              current_period_end: subscription.cancel_at_period_end && periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq('landlord_user_id', landlordUserId)
            .eq('stripe_subscription_id', subscription.id)
          if (error) console.error('stripe webhook: ai_assist customer.subscription.updated failed', error)
          break
        }
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
        if (landlordUserId && subscription.metadata?.prophandld_type === 'ai_assist') {
          // Same stale-event guard as customer.subscription.updated above —
          // this is exactly the case a background review flagged: granting
          // free_forever cancels any real existing subscription, but left
          // that subscription's own metadata pointed at this landlord, so
          // its eventual deletion event used to stomp status back to
          // 'canceled' over the active free_forever grant with nothing
          // catching it.
          const { error } = await supabaseAdmin
            .from('ai_assist_subscriptions')
            .update({ status: 'canceled', cancel_at_period_end: false, current_period_end: null, updated_at: new Date().toISOString() })
            .eq('landlord_user_id', landlordUserId)
            .eq('stripe_subscription_id', subscription.id)
          if (error) console.error('stripe webhook: ai_assist customer.subscription.deleted failed', error)
          break
        }
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

// See the account.updated case above for why this exists and why it only
// flags rather than blocks. Only landlords — a contractor sharing a real
// bank account with a landlord (e.g. the same person genuinely doing
// both, via a linked profile) is a completely different, already-handled
// case (self-dealing guard), not this loophole.
async function checkDuplicateLandlordBankAccount(
  stripe: Stripe,
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  stripeAccountId: string,
  userId: string,
  userEmail: string | null,
  userFullName: string | null
) {
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (authUser?.user?.app_metadata?.role !== 'landlord') return

  // Express accounts typically carry one payout bank account at a time,
  // but nothing guarantees exactly one is listed — check every fingerprint
  // actually on file rather than assuming index 0 is the only one.
  const externalAccounts = await stripe.accounts.listExternalAccounts(stripeAccountId, { object: 'bank_account', limit: 10 })
  const fingerprints = externalAccounts.data.map((a) => (a as Stripe.BankAccount).fingerprint).filter((f): f is string => !!f)
  if (fingerprints.length === 0) return

  const { data: matches } = await supabaseAdmin
    .from('users')
    .select('id, email, full_name')
    .in('payout_bank_fingerprint', fingerprints)
    .neq('id', userId)

  await supabaseAdmin.from('users').update({ payout_bank_fingerprint: fingerprints[0] }).eq('id', userId)

  const match = matches?.[0]
  if (match) {
    // Awaited for the same reason the caller now awaits this whole
    // function — being the last statement in an async function does not
    // make the caller's await wait for it too, only for promises this
    // function itself returns or awaits.
    await sendDuplicateLandlordBankAccountAdminEmail({
      accountA: { email: userEmail, name: userFullName },
      accountB: { email: match.email, name: match.full_name },
    }).catch((err) => console.error('stripe webhook: duplicate-bank-account admin alert failed', err))
  }
}
