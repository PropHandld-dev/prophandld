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

// Not currently called anywhere as of 2026-11-10 — both card-payment flows
// (rent, job payments) market their card option specifically as "debit
// card," and Visa/Mastercard network rules prohibit surcharging debit
// cards at all. Stripe only reports whether a card was actually
// debit/credit after a charge completes, so there's no reliable way to
// apply this compliantly today. Left defined, not deleted, since it's
// still correct math for a future credit-only surcharge mechanism once
// one exists.
export function cardProcessingFee(baseAmount: number): number {
  return Math.round((baseAmount * CARD_FEE_PERCENT + CARD_FEE_FIXED) * 100) / 100
}

// Rent by debit card: the tenant pays the card processing fee (decided by
// Nevin 2026-11-17, since bank transfer and Zelle/Venmo/Cash App are free).
// Card network rules restrict surcharging debit cards, so this is one
// switch: NEXT_PUBLIC_RENT_CARD_FEE=off removes it everywhere at once.
export const RENT_CARD_FEE_ENABLED = process.env.NEXT_PUBLIC_RENT_CARD_FEE !== 'off'

// Sized so the fee exactly covers Stripe's charge on the whole amount
// (fee included): the landlord receives the full rent and Prophandld makes
// nothing on it.
export function rentCardFee(rentAmount: number): number {
  if (!RENT_CARD_FEE_ENABLED || rentAmount <= 0) return 0
  return Math.round(((rentAmount * CARD_FEE_PERCENT + CARD_FEE_FIXED) / (1 - CARD_FEE_PERCENT)) * 100) / 100
}

// Paying a contractor by card: the landlord covers the card fee, the same
// way they cover the bank fee (decided 2026-11-18), so the contractor gets
// the full amount and Prophandld nets $0. NEXT_PUBLIC_JOB_CARD_FEE=off
// removes it.
export const JOB_CARD_FEE_ENABLED = process.env.NEXT_PUBLIC_JOB_CARD_FEE !== 'off'

export function jobCardFee(amount: number): number {
  if (!JOB_CARD_FEE_ENABLED || amount <= 0) return 0
  return Math.round(((amount * CARD_FEE_PERCENT + CARD_FEE_FIXED) / (1 - CARD_FEE_PERCENT)) * 100) / 100
}

// Stripe's standard US bank-transfer (ACH debit) rate: 0.8%, capped at $5.
// The landlord pays it on job payments; on rent, Prophandld pays it (see
// isAchFeeAbsorbed).
const ACH_FEE_PERCENT = 0.008
const ACH_FEE_CAP = 5

export function achProcessingFee(baseAmount: number): number {
  return Math.round(Math.min(baseAmount * ACH_FEE_PERCENT, ACH_FEE_CAP) * 100) / 100
}
