import Stripe from 'stripe'

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

export type LandlordTier = 'free' | 'tier_20' | 'tier_50' | 'tier_80'

export function tierForUnitCount(unitCount: number): LandlordTier {
  if (unitCount <= 2) return 'free'
  if (unitCount <= 5) return 'tier_20'
  if (unitCount <= 10) return 'tier_50'
  return 'tier_80'
}

export function priceIdForTier(tier: LandlordTier): string | null {
  switch (tier) {
    case 'tier_20':
      return process.env.STRIPE_PRICE_TIER_20 || null
    case 'tier_50':
      return process.env.STRIPE_PRICE_TIER_50 || null
    case 'tier_80':
      return process.env.STRIPE_PRICE_TIER_80 || null
    default:
      return null
  }
}

export const TIER_LABELS: Record<LandlordTier, string> = {
  free: 'Free',
  tier_20: '$20/month',
  tier_50: '$50/month',
  tier_80: '$80/month',
}
