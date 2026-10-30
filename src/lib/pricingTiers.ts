// Client-safe — no server-only imports, so BillingSection (a 'use client'
// component) can use these directly instead of pulling in the whole
// `stripe` package (which lib/stripe.ts does, and which has no business
// being in a browser bundle). lib/stripe.ts re-exports tierForUnitCount
// from here for the server routes that also need it.

export type LandlordTier = 'free' | 'starter' | 'growth' | 'portfolio' | 'enterprise'

// A landlord owes nothing at 1 unit (Free) regardless of how long they've
// had the account — this only ever starts counting down from the moment
// they first exceed that, i.e. the first time they'd genuinely owe a
// subscription. Deliberately not from signup: someone who takes a month to
// add their second property shouldn't find their trial already half spent
// the day they actually need it. See trial_started_at on public.users,
// stamped once (claim-once, same pattern as welcomed_at) the first time
// subscription/status sees them cross this line.
export const TRIAL_DAYS = 14

// The tier NAMES and their unit ranges are unchanged from Joshua's
// structure. What changed is the price *within* Starter: it used to be one
// flat $79 across the whole 2–25 range; it's now three separate flat
// prices ($19.99 for 2–4, $39.99 for 5–10, $79.99 for 11–25) before the
// same per-unit rates as before kick in above 25/100/500.
export function tierForUnitCount(unitCount: number): LandlordTier {
  if (unitCount <= 1) return 'free'
  if (unitCount <= 25) return 'starter'
  if (unitCount <= 100) return 'growth'
  if (unitCount <= 500) return 'portfolio'
  return 'enterprise'
}

export const TIER_RANGE_LABELS: Record<LandlordTier, string> = {
  free: '1 unit',
  starter: '2–25 units',
  growth: '26–100 units',
  portfolio: '101–500 units',
  enterprise: '500+ units',
}

// A generic per-tier price description — used only where there's no real
// landlord/unit count to compute an exact figure from (a marketing
// reference to "the Starter tier", say). Starter no longer has one fixed
// price, so this shows its range instead of a single number; anywhere a
// specific landlord's actual bill is shown should use formatTierPrice()
// with their real unit count instead of this.
export const TIER_LABELS: Record<LandlordTier, string> = {
  free: 'Free',
  starter: '$19.99–$79.99/month',
  growth: '$79.99 + $1.75/unit over 25',
  portfolio: '$79.99 + $1.75/unit over 25',
  enterprise: '$79.99 + $1.75/unit over 25',
}

// Customer-facing tier names (what the /pricing page and the signup price
// estimator show) — deliberately separate from LandlordTier above, which
// stays as the internal 5-bucket admin-analytics categorization (snapshot
// cron, tier-mix chart) that nothing here needs to disturb. These are
// purely a naming/marketing layer over the same graduatedMonthlyAmount()
// numbers: Free/Basic/Pro/Executive map 1:1 onto the old Free/Starter's
// three flat steps, and Portfolio is every unit count above 25 collapsing
// the old Growth/Portfolio/Enterprise three-step into the one flat rate.
export function marketingTierName(unitCount: number): string {
  if (unitCount <= 1) return 'Free'
  if (unitCount <= 4) return 'Basic'
  if (unitCount <= 10) return 'Pro'
  if (unitCount <= 25) return 'Executive'
  return 'Portfolio'
}

// The actual graduated formula, mirrored here for anywhere that needs a
// real dollar figure without calling Stripe (admin reporting, mainly) —
// Stripe's own tiered Price (configured with matching flat/per-unit
// brackets in the Dashboard) is still the source of truth for what a
// landlord is actually charged. Flat brackets for 2–4/5–10/11–25 units,
// then one flat $1.75/unit rate above 25 — simplified 2026-10-24 from the
// earlier three-step marginal rate (25/100/500) at Joshua's call, since a
// single continuing rate is easier to say out loud and to defend than
// "it gets cheaper twice more, trust us" for landlords who never asked.
export function graduatedMonthlyAmount(unitCount: number): number {
  if (unitCount <= 1) return 0
  if (unitCount <= 4) return 19.99
  if (unitCount <= 10) return 39.99
  if (unitCount <= 25) return 79.99
  return 79.99 + (unitCount - 25) * 1.75
}

// The real price for a specific landlord's exact unit count — use this
// instead of TIER_LABELS wherever an actual bill is being shown, since a
// tier alone (especially Starter) no longer implies one fixed number.
export function formatTierPrice(unitCount: number): string {
  const amount = graduatedMonthlyAmount(unitCount)
  if (amount === 0) return 'Free'
  const rounded = Math.round(amount * 100) / 100
  return `$${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)}/month`
}

// AI Assist add-on (v1, pending team sign-off on the PDF proposal before
// this is ever enabled for a real landlord — see NEXT_PUBLIC_AI_ASSIST_ENABLED
// in aiAssist.ts). Numbers are Joshua's proposed bracket pricing (same flat-
// per-bracket shape as the base plan, so it's one mirrored Stripe graduated
// Price, not a new kind of calculation) — placeholder pending the team's
// sign-off on the PDF, change here and in the matching Stripe Price config
// if the number moves.
export const AI_ASSIST_TRIAL_DAYS = 14

export function aiAssistMonthlyAmount(unitCount: number): number {
  if (unitCount <= 1) return 4.99
  if (unitCount <= 4) return 9.99
  if (unitCount <= 10) return 14.99
  if (unitCount <= 25) return 24.99
  return 24.99 + (unitCount - 25) * 0.5
}

export function formatAiAssistPrice(unitCount: number): string {
  const amount = aiAssistMonthlyAmount(unitCount)
  return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}/month`
}
