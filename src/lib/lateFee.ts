// A landlord could type any number into the late-fee field with zero
// validation, and that exact amount got added to the renter's real Stripe
// charge once the grace period passed — confirmed by reading the cron job
// and payment code directly, not just a display number. Many states and
// cities cap late fees by law, usually as a percentage of rent, but the
// exact cap varies by jurisdiction and isn't something this app knows
// per-property yet (that needs real per-state legal research). Until then,
// this is a conservative, generic ceiling — a safety net against an
// obviously-wrong number, not a substitute for confirming the real local
// limit, which is still on the attorney list.
export const MAX_LATE_FEE_PERCENT_OF_RENT = 0.10

export function maxLateFee(rentAmount: number | null | undefined): number | null {
  if (!rentAmount || rentAmount <= 0) return null
  return Math.round(rentAmount * MAX_LATE_FEE_PERCENT_OF_RENT * 100) / 100
}
