import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'
import { achProcessingFee } from '@/lib/cardSurcharge'
import { friendlyStripeError } from '@/lib/stripeErrorMessage'

export const maxDuration = 20

// The owner pays their PM's management fee directly to the PM's own
// Stripe Connect account -- the exact same direct-charge shape job
// payments already use (landlord pays contractor's connected account),
// just landlord-pays-PM instead of landlord-pays-contractor. Prophandld
// never holds the money either way, and this reuses that route's own
// surcharge/idempotency logic almost line for line on purpose, rather
// than inventing a second payment pattern for what is structurally the
// same thing.
export async function POST(request: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { paymentMethod } = (await request.json().catch(() => ({}))) as { paymentMethod?: 'bank' | 'card' }
  const method: 'bank' | 'card' = paymentMethod === 'card' ? 'card' : 'bank'

  const supabaseAdmin = getSupabaseAdmin()

  const { data: portfolio } = await supabaseAdmin
    .from('pm_client_portfolios')
    .select('id, owner_user_id, status, management_fee, organization_id, pm_organizations(admin_user_id)')
    .eq('id', portfolioId)
    .eq('status', 'accepted')
    .maybeSingle()

  if (!portfolio || portfolio.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!portfolio.management_fee || Number(portfolio.management_fee) <= 0) {
    return NextResponse.json({ error: 'No management fee is set for this client.' }, { status: 400 })
  }

  const pmAdminId = (portfolio.pm_organizations as any)?.admin_user_id
  const { data: pmAdminRow } = await supabaseAdmin
    .from('users')
    .select('stripe_connect_account_id, stripe_connect_status, payout_frozen_until, full_name')
    .eq('id', pmAdminId)
    .maybeSingle()

  if (!pmAdminRow?.stripe_connect_account_id || pmAdminRow.stripe_connect_status !== 'active') {
    return NextResponse.json({ error: "Your property manager hasn't set up payouts yet." }, { status: 400 })
  }
  if (pmAdminRow.payout_frozen_until && new Date(pmAdminRow.payout_frozen_until) > new Date()) {
    return NextResponse.json(
      { error: "Your property manager's payout details recently changed. Payments are paused for 48 hours as a security precaution." },
      { status: 400 }
    )
  }

  const amount = Number(portfolio.management_fee)
  const surcharge = method === 'bank' ? achProcessingFee(amount) : 0
  const chargeAmount = amount + surcharge
  const stripe = getStripe()
  const amountCents = Math.round(chargeAmount * 100)
  const applicationFeeCents = Math.round(surcharge * 100)
  const paymentMethodTypes = method === 'card' ? ['card'] : ['us_bank_account']
  const connectedAccountId = pmAdminRow.stripe_connect_account_id

  try {
    const { data: openPayment } = await supabaseAdmin
      .from('pm_fee_payments')
      .select('id, stripe_payment_intent_id')
      .eq('portfolio_id', portfolioId)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (openPayment?.stripe_payment_intent_id) {
      try {
        const existing = await stripe.paymentIntents.retrieve(openPayment.stripe_payment_intent_id, undefined, { stripeAccount: connectedAccountId })
        if (existing.status !== 'canceled' && existing.status !== 'succeeded') {
          const reusable =
            ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.status) &&
            existing.amount === amountCents &&
            existing.client_secret &&
            existing.payment_method_types?.length === paymentMethodTypes.length &&
            existing.payment_method_types?.every((t) => paymentMethodTypes.includes(t))
          if (reusable) {
            return NextResponse.json({ clientSecret: existing.client_secret, amount: chargeAmount, baseAmount: amount, fee: surcharge, connectedAccountId })
          }
          await stripe.paymentIntents.cancel(existing.id, undefined, { stripeAccount: connectedAccountId }).catch(() => {})
        }
      } catch (err) {
        console.error('pm fee create-payment-intent: could not check existing intent', err)
      }
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        payment_method_types: paymentMethodTypes,
        ...(applicationFeeCents ? { application_fee_amount: applicationFeeCents } : {}),
        metadata: {
          prophandld_type: 'pm_management_fee',
          prophandld_portfolio_id: portfolioId,
          prophandld_base_amount: amount.toFixed(2),
          prophandld_card_surcharge: surcharge.toFixed(2),
        },
      },
      { stripeAccount: connectedAccountId }
    )

    await supabaseAdmin.from('pm_fee_payments').insert({
      portfolio_id: portfolioId,
      amount,
      status: 'pending',
      stripe_payment_intent_id: paymentIntent.id,
    })

    return NextResponse.json({ clientSecret: paymentIntent.client_secret, amount: chargeAmount, baseAmount: amount, fee: surcharge, connectedAccountId })
  } catch (err) {
    console.error('pm fee create-payment-intent: unhandled error', err)
    return NextResponse.json({ error: friendlyStripeError(err, 'start that payment') }, { status: 500 })
  }
}
