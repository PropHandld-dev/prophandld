'use client'

import { loadStripe, Stripe } from '@stripe/stripe-js'

let stripePromise: Promise<Stripe | null> | null = null

export function getStripeClient() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    // In test mode Stripe.js adds a floating "stripe" developer badge in the
    // bottom-right corner, which can sit on top of buttons and tab bars.
    // Nobody paying rent needs it, so it's switched off.
    stripePromise = key ? loadStripe(key, { developerTools: { assistant: { enabled: false } } }) : Promise.resolve(null)
  }
  return stripePromise
}
