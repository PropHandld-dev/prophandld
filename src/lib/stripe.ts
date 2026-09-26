import Stripe from 'stripe'
import { tierForUnitCount, type LandlordTier } from '@/lib/pricingTiers'

export { tierForUnitCount, type LandlordTier }

// Server-only. Built lazily so a missing STRIPE_SECRET_KEY doesn't crash
// the build — Next.js evaluates route modules at build time before
// request-time env vars are guaranteed to be set (same pattern as
// getSupabaseAdmin in supabaseAdmin.ts).
let stripeClient: Stripe | null = null

export function getStripe() {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!)
  }
  return stripeClient
}

// When a payment actually went through: the charge's time when the intent
// was fetched with expand: ['latest_charge'], otherwise when it was created.
export function paymentPaidAt(paymentIntent: Stripe.PaymentIntent): string {
  const charge =
    paymentIntent.latest_charge && typeof paymentIntent.latest_charge !== 'string' ? paymentIntent.latest_charge : null
  return new Date((charge?.created ?? paymentIntent.created) * 1000).toISOString()
}

// Payout accounts only request the `transfers` capability (no
// card_payments), so charges_enabled never turns true for them. Setup is
// complete once transfers are active and payouts are enabled — this also
// holds for older accounts that still carry card_payments.
export function isPayoutReady(account: Stripe.Account) {
  return account.capabilities?.transfers === 'active' && account.payouts_enabled === true
}

// Every paid tier bills off the same one Stripe Price — Stripe itself
// computes the graduated total from `quantity` (the real unit count)
// against the tiers configured on that Price, so there's never a
// different price id per tier, only a different quantity. See the setup
// note handed over alongside this change for the exact tier config to
// enter in Stripe.
export function graduatedPriceId(): string | null {
  return process.env.STRIPE_PRICE_GRADUATED || null
}
