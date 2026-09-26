// Client-safe — no server-only imports, so BillingSection (a 'use client'
// component) can use these directly instead of pulling in the whole
// `stripe` package (which lib/stripe.ts does, and which has no business
// being in a browser bundle). lib/stripe.ts re-exports tierForUnitCount
// from here for the server routes that also need it.

export type LandlordTier = 'free' | 'starter' | 'growth' | 'portfolio' | 'enterprise'

// Joshua's structure, confirmed graduated (no cliffs): free for exactly 1
// unit, a flat $79 through 25, then a genuinely marginal per-unit rate
// above each threshold — the same shape as a tax bracket, not a flat rate
// applied to the whole count.
export function tierForUnitCount(unitCount: number): LandlordTier {
  if (unitCount <= 1) return 'free'
  if (unitCount <= 25) return 'starter'
  if (unitCount <= 100) return 'growth'
  if (unitCount <= 500) return 'portfolio'
  return 'enterprise'
}

export const TIER_LABELS: Record<LandlordTier, string> = {
  free: 'Free',
  starter: '$79/month',
  growth: '$79 + $1.75/unit over 25',
  portfolio: '$210.25 + $1.25/unit over 100',
  enterprise: '$710 + $1/unit over 500',
}

export const TIER_RANGE_LABELS: Record<LandlordTier, string> = {
  free: '1 unit',
  starter: '2–25 units',
  growth: '26–100 units',
  portfolio: '101–500 units',
  enterprise: '500+ units',
}

// The actual graduated formula, mirrored here for anywhere that needs a
// real dollar figure without calling Stripe (admin reporting, mainly) —
// Stripe's own tiered Price is still the source of truth for what a
// landlord is actually charged. Checked against Joshua's own numbers:
// 25u=$79, 50u=$116.50, 100u=$210.25, 200u=$335.25, 500u=$710.25.
export function graduatedMonthlyAmount(unitCount: number): number {
  if (unitCount <= 1) return 0
  if (unitCount <= 25) return 79
  if (unitCount <= 100) return 79 + (unitCount - 25) * 1.75
  if (unitCount <= 500) return 79 + 75 * 1.75 + (unitCount - 100) * 1.25
  return 79 + 75 * 1.75 + 400 * 1.25 + (unitCount - 500) * 1
}
