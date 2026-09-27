// Stripe's standard US card rate: 2.9% + $0.30, flat regardless of debit vs
// credit (no negotiated Interchange-Plus pricing here, just the default
// published rate). Zero external imports on purpose — this needs to run
// both server-side (to size the actual charge and application_fee_amount)
// and client-side (to show the fee before the tenant commits to a method),
// and importing lib/stripe.ts from a client component would pull the
// server-only Stripe SDK into the browser bundle for nothing.
//
// Computed on the base amount only, not grossed-up to also cover the
// fee-on-the-surcharge-itself sliver — the same simplification almost every
// real surcharge implementation uses, since a fully grossed-up formula
// produces odd-looking totals to save a fraction of a cent. Bank transfers
// (ACH) stay genuinely free for the payer; Prophandld absorbs that smaller,
// capped fee itself rather than passing it on.
const CARD_FEE_PERCENT = 0.029
const CARD_FEE_FIXED = 0.3

export function cardProcessingFee(baseAmount: number): number {
  return Math.round((baseAmount * CARD_FEE_PERCENT + CARD_FEE_FIXED) * 100) / 100
}
