import Stripe from 'stripe'

// Every Stripe-calling route in this app used to pass err.message straight
// to the client on failure — accurate for a server log, meaningless to the
// landlord/renter/contractor looking at it. A connection-level failure
// specifically ("Request was retried N times") reads like the product
// itself is broken rather than Stripe being briefly unreachable. Callers
// still log the real `err` server-side before calling this — this only
// decides what the client sees.
export function friendlyStripeError(err: unknown, action = 'complete that'): string {
  if (err instanceof Stripe.errors.StripeError) {
    return `Couldn't ${action} with Stripe just now — this is usually temporary. Try again in a moment, and contact admin@prophandld.com if it keeps happening.`
  }
  return err instanceof Error ? err.message : 'Unknown error'
}
