'use client'

import { loadStripe, Stripe } from '@stripe/stripe-js'

// Keyed by connected-account id ('platform' when none) — a direct-charge
// PaymentIntent (rent, as of the Standard-accounts rebuild) lives in the
// CONNECTED account's own namespace, so confirming it client-side needs
// Stripe.js initialized with that account's context via the stripeAccount
// option; job payments (still destination charges, unchanged) keep using
// the plain platform client. A single shared cache keyed only by "is
// there an account id" would serve the wrong client to whichever flow
// asks second, so each distinct account gets its own cached promise
// instead of one global singleton.
const stripePromises = new Map<string, Promise<Stripe | null>>()

export function getStripeClient(connectedAccountId?: string) {
  const cacheKey = connectedAccountId || 'platform'
  let promise = stripePromises.get(cacheKey)
  if (!promise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    // In test mode Stripe.js adds a floating "stripe" developer badge in the
    // bottom-right corner, which can sit on top of buttons and tab bars.
    // Nobody paying rent needs it, so it's switched off.
    promise = key
      ? loadStripe(key, {
          developerTools: { assistant: { enabled: false } },
          ...(connectedAccountId ? { stripeAccount: connectedAccountId } : {}),
        })
      : Promise.resolve(null)
    stripePromises.set(cacheKey, promise)
  }
  return promise
}
