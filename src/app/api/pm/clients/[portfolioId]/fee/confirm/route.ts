import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe, paymentPaidAt } from '@/lib/stripe'

export const maxDuration = 15

// Direct counterpart to job-payment/confirm -- asks Stripe directly
// whether the fee payment went through, same reasoning: the webhook does
// the same job but can lag a few seconds behind what the owner sees on
// screen.
export async function POST(request: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: portfolio } = await supabaseAdmin
    .from('pm_client_portfolios')
    .select('owner_user_id, pm_organizations(admin_user_id)')
    .eq('id', portfolioId)
    .maybeSingle()

  if (!portfolio || portfolio.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const pmAdminId = (portfolio.pm_organizations as any)?.admin_user_id
  const { data: pmAdminRow } = await supabaseAdmin.from('users').select('stripe_connect_account_id').eq('id', pmAdminId).maybeSingle()
  const connectedAccountId = pmAdminRow?.stripe_connect_account_id
  if (!connectedAccountId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: payment } = await supabaseAdmin
    .from('pm_fee_payments')
    .select('id, status, stripe_payment_intent_id')
    .eq('portfolio_id', portfolioId)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!payment?.stripe_payment_intent_id) {
    return NextResponse.json({ error: 'No payment in progress' }, { status: 404 })
  }

  const stripe = getStripe()
  const intent = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id, undefined, { stripeAccount: connectedAccountId })

  if (intent.status === 'processing') {
    await supabaseAdmin.from('pm_fee_payments').update({ status: 'processing' }).eq('id', payment.id).neq('status', 'paid')
    return NextResponse.json({ status: 'processing' })
  }
  if (intent.status !== 'succeeded') {
    return NextResponse.json({ status: 'unpaid' })
  }

  const { data: updated } = await supabaseAdmin
    .from('pm_fee_payments')
    .update({ status: 'paid', paid_at: paymentPaidAt(intent) })
    .eq('id', payment.id)
    .neq('status', 'paid')
    .select('id')

  return NextResponse.json({ status: 'paid', alreadyRecorded: !updated || updated.length === 0 })
}
