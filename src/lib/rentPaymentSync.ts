import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { paymentPaidAt } from '@/lib/stripe'

export type RentSyncStatus = 'none' | 'paid' | 'processing' | 'unpaid' | 'refunded_credit_card'

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
    .select('id, actual_amount, stripe_payment_intent_id, stripe_status')
    .eq('id', rentPaymentId)
    .maybeSingle()

  if (!rent?.stripe_payment_intent_id) return 'none'
  if (rent.stripe_status === 'succeeded') return 'paid'
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
    await stripe.refunds.create({ payment_intent: paymentIntent.id }).catch((err) => {
      console.error('rent sync: credit card refund failed', err)
    })
    await admin.from('rent_payments').update({ stripe_status: 'refunded_credit_card' }).eq('id', rent.id)
    return 'refunded_credit_card'
  }

  // The status guard makes concurrent callers (webhook and confirm) safe:
  // only the first one to commit changes the row.
  await admin
    .from('rent_payments')
    .update({
      actual_amount: Number(rent.actual_amount || 0) + paymentIntent.amount / 100,
      paid_date: paymentPaidAt(paymentIntent).slice(0, 10),
      payment_method: method?.type === 'us_bank_account' ? 'bank' : 'card',
      stripe_status: 'succeeded',
    })
    .eq('id', rent.id)
    .neq('stripe_status', 'succeeded')

  return 'paid'
}
