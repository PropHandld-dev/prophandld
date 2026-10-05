import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { getStripe } from '@/lib/stripe'

// Built after a real incident: a trailing-whitespace STRIPE_SECRET_KEY
// silently broke every Stripe call in production, and the first anyone
// knew was a user hitting a payment error. This page exists so that kind
// of misconfiguration shows up here, checked proactively, instead of
// being discovered one user bug report at a time.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const admin = getSupabaseAdmin()

  // Prefix alone — never log or return the actual secret value.
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim() || ''
  const stripeKeyPresent = stripeKey.length > 0
  const stripeMode = stripeKey.startsWith('sk_live_') ? 'live' : stripeKey.startsWith('sk_test_') ? 'test' : stripeKeyPresent ? 'unrecognized' : 'not_set'

  let stripeConnectionOk = false
  let stripeConnectionError: string | null = null
  if (stripeKeyPresent) {
    try {
      // A cheap, harmless, read-only call — this is exactly the call
      // shape that surfaced the ERR_INVALID_CHAR bug for real. If the key
      // has a stray character, this fails here instead of on someone's
      // actual payment attempt.
      await getStripe().balance.retrieve()
      stripeConnectionOk = true
    } catch (err) {
      stripeConnectionError = err instanceof Error ? err.message : 'Unknown error'
    }
  }

  const priceId = process.env.STRIPE_PRICE_GRADUATED?.trim() || null
  let priceResolvesOk = false
  let priceError: string | null = null
  if (priceId && stripeConnectionOk) {
    try {
      await getStripe().prices.retrieve(priceId)
      priceResolvesOk = true
    } catch (err) {
      priceError = err instanceof Error ? err.message : 'Unknown error'
    }
  }

  const twilio = {
    accountSidPresent: Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()),
    authTokenPresent: Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()),
    phoneNumberPresent: Boolean(process.env.TWILIO_PHONE_NUMBER?.trim()),
  }

  const resend = {
    apiKeyPresent: Boolean(process.env.RESEND_API_KEY?.trim()),
  }

  const webhookSecretPresent = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim())

  const { data: frozenAccounts, error: frozenError } = await admin
    .from('users')
    .select('id, full_name, email, payout_frozen_until')
    .gt('payout_frozen_until', new Date().toISOString())
    .order('payout_frozen_until', { ascending: true })

  if (frozenError) {
    console.error('system-health: frozen accounts query failed', frozenError)
  }

  // A job payment stuck on "processing" for more than an hour is never
  // normal Stripe latency — found during testing that this is exactly
  // what a STRIPE_SECRET_KEY live/test mode switch after a payment
  // started looks like (the PaymentIntent becomes permanently
  // unreachable, confirm/job-payment logs "No such payment_intent").
  // Surfacing the count here means it shows up on this page instead of
  // only being found by a contractor noticing they were never paid.
  const staleProcessingSince = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: stuckBids, error: stuckBidsError } = await admin
    .from('bids')
    .select('id, job_id, stripe_payment_intent_id, created_at')
    .eq('payment_status', 'processing')
    .lt('created_at', staleProcessingSince)
    .order('created_at', { ascending: true })
    .limit(50)

  if (stuckBidsError) {
    console.error('system-health: stuck bids query failed', stuckBidsError)
  }

  return NextResponse.json({
    stripe: {
      keyPresent: stripeKeyPresent,
      mode: stripeMode,
      connectionOk: stripeConnectionOk,
      connectionError: stripeConnectionError,
      webhookSecretPresent,
      priceConfigured: Boolean(priceId),
      priceResolvesOk,
      priceError,
    },
    twilio,
    resend,
    frozenPayoutAccounts: (frozenAccounts || []).map((u) => ({
      id: u.id,
      name: u.full_name || 'Unknown',
      email: u.email,
      frozenUntil: u.payout_frozen_until,
    })),
    stuckProcessingPayments: (stuckBids || []).map((b) => ({
      bidId: b.id,
      jobId: b.job_id,
      stripePaymentIntentId: b.stripe_payment_intent_id,
      createdAt: b.created_at,
    })),
  })
}
