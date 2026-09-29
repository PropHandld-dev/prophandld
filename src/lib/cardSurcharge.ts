// Stripe's standard US card rate: 2.9% + $0.30, flat regardless of debit vs
// credit (no negotiated Interchange-Plus pricing here, just the default
// published rate). Zero external imports on purpose — this needs to run
// both server-side (to size the actual charge and application_fee_amount)
// and client-side (to show the fee before the payer commits to a method),
// and importing lib/stripe.ts from a client component would pull the
// server-only Stripe SDK into the browser bundle for nothing.
//
// Computed on the base amount only, not grossed-up to also cover the
// fee-on-the-surcharge-itself sliver — the same simplification almost every
// real surcharge implementation uses, since a fully grossed-up formula
// produces odd-looking totals to save a fraction of a cent.
const CARD_FEE_PERCENT = 0.029
const CARD_FEE_FIXED = 0.3

export function cardProcessingFee(baseAmount: number): number {
  return Math.round((baseAmount * CARD_FEE_PERCENT + CARD_FEE_FIXED) * 100) / 100
}

// Stripe's standard US bank-transfer (ACH debit) rate: 0.8%, capped at $5.
// For rent, this stays a cost Prophandld absorbs itself (a tenant paying by
// bank should never see a fee). For job payments, the landlord is already
// choosing to pay a contractor for real work and picking their bid either
// way, so this one is passed through the same way the card fee already is —
// see job-payment/create-payment-intent's own comment for the reasoning.
const ACH_FEE_PERCENT = 0.008
const ACH_FEE_CAP = 5

export function achProcessingFee(baseAmount: number): number {
  return Math.round(Math.min(baseAmount * ACH_FEE_PERCENT, ACH_FEE_CAP) * 100) / 100
}
