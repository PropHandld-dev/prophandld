import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { paymentPaidAt } from '@/lib/stripe'
import { getTransfer, dwollaTransferUrl } from '@/lib/dwolla'

export type RentSyncStatus = 'none' | 'paid' | 'already_paid' | 'processing' | 'unpaid' | 'refunded_credit_card'

/**
 * Brings one rent month in line with what Stripe says about its latest
 * payment attempt. Safe to call from the webhook, the confirm route and page
 * loads alike: once a payment has been applied (stripe_status = 'succeeded')
 * it is never applied twice, and credit cards are refunded, not credited.
 */
export async function syncRentPayment(
  admin: SupabaseClient,
  stripe: Stripe,
  rentPaymentId: string
): Promise<RentSyncStatus> {
  const { data: rent } = await admin
    .from('rent_payments')
    .select('id, actual_amount, card_surcharge_amount, stripe_payment_intent_id, stripe_status')
    .eq('id', rentPaymentId)
    .maybeSingle()

  if (!rent?.stripe_payment_intent_id) return 'none'
  // Distinct from the fresh-apply 'paid' below: this row was already
  // credited by an earlier call (a prior webhook delivery, a page poll
  // that beat this one to it, etc). Callers that just want "is it paid"
  // treat this the same as 'paid'; the webhook uses the distinction to
  // never re-send a "you got paid" email/push/chat message on a retry.
  if (rent.stripe_status === 'succeeded') return 'already_paid'
  if (rent.stripe_status === 'refunded_credit_card') return 'refunded_credit_card'

  const paymentIntent = await stripe.paymentIntents.retrieve(rent.stripe_payment_intent_id, {
    expand: ['latest_charge', 'payment_method'],
  })

  // Never trust an intent that doesn't belong to this rent month.
  if (paymentIntent.metadata?.prophandld_rent_payment_id !== rent.id) return 'none'

  if (paymentIntent.status === 'processing') {
    if (rent.stripe_status !== 'processing') {
      await admin.from('rent_payments').update({ stripe_status: 'processing' }).eq('id', rent.id)
    }
    return 'processing'
  }

  if (paymentIntent.status !== 'succeeded') return 'unpaid'

  const method =
    paymentIntent.payment_method && typeof paymentIntent.payment_method !== 'string' ? paymentIntent.payment_method : null

  // Rent takes debit cards and bank transfers only. Stripe reports credit and
  // debit both as 'card', so credit cards are caught here and refunded.
  if (method?.card?.funding === 'credit') {
    // reverse_transfer takes the money back from the landlord's connected account;
    // without it the platform would refund the renter out of its own balance.
    try {
      await stripe.refunds.create(
        { payment_intent: paymentIntent.id, reverse_transfer: true },
        { idempotencyKey: `rent-credit-card-refund-${paymentIntent.id}` }
      )
    } catch (err) {
      // Not refunded (for example the landlord's balance can't cover it).
      // Don't record it as refunded or as paid; the next check tries again.
      console.error('rent sync: credit card refund failed', err)
      return 'unpaid'
    }
    await admin.from('rent_payments').update({ stripe_status: 'refunded_credit_card' }).eq('id', rent.id)
    return 'refunded_credit_card'
  }

  // A card payment's PaymentIntent amount includes Stripe's processing fee
  // as a surcharge on top of rent (see create-payment-intent) — that
  // surcharge is Prophandld's, not rent, so it must never be counted
  // toward what the tenant "paid" here. prophandld_base_amount carries the
  // real rent portion; older intents from before this existed have no such
  // metadata, and for those (and for bank payments, which are never
  // surcharged) the full amount already equals the base amount.
  const baseAmount = paymentIntent.metadata?.prophandld_base_amount
    ? Number(paymentIntent.metadata.prophandld_base_amount)
    : paymentIntent.amount / 100
  // What the tenant was actually charged on top of rent for paying by card
  // — kept separately from actual_amount (which must only ever mean "rent
  // credited") purely so the tenant's own payment history and receipt can
  // show their real total. Absent (old intents, or a bank payment) reads
  // as 0, never null-propagates into the running total below.
  const surcharge = paymentIntent.metadata?.prophandld_card_surcharge
    ? Number(paymentIntent.metadata.prophandld_card_surcharge)
    : 0

  // The status guard makes concurrent callers (webhook and confirm) safe:
  // only the first one to commit changes the row. But the guard alone only
  // protects the DB write — without checking whether this call actually
  // won that race, every caller still reported 'paid' regardless, so a
  // webhook retry landing at the same moment as the renter's own
  // /confirm call (or a redelivered webhook) could send the landlord's
  // "rent paid" email/push/chat message twice for one real payment. The
  // job-payment branch of the webhook handler already guards this
  // correctly (.select() + a row-count check) — same fix here.
  const { data: updated } = await admin
    .from('rent_payments')
    .update({
      actual_amount: Number(rent.actual_amount || 0) + baseAmount,
      card_surcharge_amount: Number(rent.card_surcharge_amount || 0) + surcharge,
      paid_date: paymentPaidAt(paymentIntent).slice(0, 10),
      payment_method: method?.type === 'us_bank_account' ? 'bank' : 'card',
      stripe_status: 'succeeded',
    })
    .eq('id', rent.id)
    .neq('stripe_status', 'succeeded')
    .select('id')

  if (!updated || updated.length === 0) return 'already_paid'

  return 'paid'
}

export type DwollaRentSyncStatus = 'none' | 'paid' | 'already_paid' | 'processing' | 'unpaid' | 'failed' | 'already_failed'

/**
 * The Dwolla twin of syncRentPayment() above — same idempotency shape
 * (status-guarded update, 'already_paid' on a lost race), same chokepoint
 * called from both the Dwolla webhook and the confirm route. No credit-card
 * branch: Dwolla funding sources are real bank accounts only, so there's
 * nothing equivalent to refund here.
 */
export async function syncDwollaRentPayment(
  admin: SupabaseClient,
  rentPaymentId: string
): Promise<DwollaRentSyncStatus> {
  const { data: rent } = await admin
    .from('rent_payments')
    .select('id, actual_amount, dwolla_transfer_id, dwolla_status')
    .eq('id', rentPaymentId)
    .maybeSingle()

  if (!rent?.dwolla_transfer_id) return 'none'
  if (rent.dwolla_status === 'processed') return 'already_paid'
  // Already recorded as failed by an earlier call — distinct from the
  // fresh-transition 'failed' below, so a redelivered webhook event (or a
  // renter-triggered /confirm landing right after it) never re-sends the
  // "bank transfer didn't go through" email a second time for the same
  // failure. Same shape as 'already_paid' above.
  if (rent.dwolla_status === 'failed' || rent.dwolla_status === 'cancelled') return 'already_failed'

  const transfer = await getTransfer(dwollaTransferUrl(rent.dwolla_transfer_id))

  // Never trust a transfer that doesn't belong to this rent month.
  if (transfer.correlationId && transfer.correlationId !== rent.id) return 'none'

  if (transfer.status === 'pending') {
    if (rent.dwolla_status !== 'pending') {
      await admin.from('rent_payments').update({ dwolla_status: 'pending' }).eq('id', rent.id)
    }
    return 'processing'
  }

  if (transfer.status === 'cancelled' || transfer.status === 'failed') {
    // Same atomic-update race guard as the 'paid' path below — only the
    // first caller to actually flip the status away from its prior value
    // reports the fresh 'failed' transition and sends the notification;
    // a concurrent second caller sees 0 rows updated and reports
    // 'already_failed' instead.
    const { data: updated } = await admin
      .from('rent_payments')
      .update({ dwolla_status: transfer.status })
      .eq('id', rent.id)
      .neq('dwolla_status', transfer.status)
      .select('id')
    return updated && updated.length > 0 ? 'failed' : 'already_failed'
  }

  if (transfer.status !== 'processed') return 'unpaid'

  const amount = Number(transfer.amount.value)

  // Same race-safety guard as syncRentPayment: only the first caller to
  // win this update reports 'paid', so a redelivered webhook landing next
  // to a renter-triggered /confirm call never double-sends the landlord's
  // "rent paid" notification.
  const { data: updated } = await admin
    .from('rent_payments')
    .update({
      actual_amount: Number(rent.actual_amount || 0) + amount,
      paid_date: new Date().toISOString().slice(0, 10),
      payment_method: 'bank',
      dwolla_status: 'processed',
    })
    .eq('id', rent.id)
    .neq('dwolla_status', 'processed')
    .select('id')

  if (!updated || updated.length === 0) return 'already_paid'

  return 'paid'
}
