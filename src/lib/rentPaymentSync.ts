import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { paymentPaidAt } from '@/lib/stripe'

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
  // only the first one to commit changes the row.
  await admin
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

  return 'paid'
}
