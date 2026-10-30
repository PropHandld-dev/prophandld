import type { SupabaseClient } from '@supabase/supabase-js'
import { getTwilioClient } from '@/lib/sms'

// Shared by /api/admin/cost-items and the weekly digest (cron +
// /api/admin/weekly-digest) so "what counts as this month's infra cost"
// never drifts between the two. An annual cost (the domain, Apple's
// $99/year) is amortized over 12 months so it still shows up in the
// number that matters for a monthly/weekly net-margin conversation; a
// true one-time cost (Google Play's $25 registration) never recurs, so
// it's excluded entirely.
export function monthlyEquivalent(amount: number, frequency: string) {
  if (frequency === 'annual') return amount / 12
  if (frequency === 'one_time') return 0
  return amount
}

// Confirmed live (2026-10-26): Twilio's own Usage Records API, category
// 'totalprice', returns the account's real spend since startDate — no new
// credential needed, reuses the same TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN
// already configured for SMS sending. `price` comes back negative (a
// debit); shown here as a positive cost like every other line item.
// Resend and Sentry don't get the same treatment: Resend's usage API is
// still private beta and returns email counts, not a dollar figure;
// Sentry has no documented endpoint that returns one at all — both stay
// manual rather than ship something likely to misreport or break.
async function fetchLiveTwilioCost(): Promise<number | null> {
  if (!process.env.TWILIO_ACCOUNT_SID?.trim() || !process.env.TWILIO_AUTH_TOKEN?.trim()) return null
  try {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const records = await getTwilioClient().usage.records.list({ category: 'totalprice', startDate: startOfMonth })
    return records.reduce((sum, r) => sum + Math.abs(Number(r.price) || 0), 0)
  } catch (err) {
    console.error('costItems: live Twilio usage fetch failed', err)
    return null
  }
}

// ai_usage_log.cost_usd (src/lib/claude.ts logs one row per claudeJson()
// call) is the real number, computed from Anthropic's own published rate
// at the moment each call happened — same "pull the real figure, don't
// hand-estimate it" reasoning as the Twilio row above.
async function fetchLiveAiCost(admin: SupabaseClient): Promise<number | null> {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { data, error } = await admin.from('ai_usage_log').select('cost_usd').gte('created_at', startOfMonth)
  if (error) {
    console.error('costItems: live AI usage fetch failed', error)
    return null
  }
  return (data || []).reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0)
}

// Shared by the authenticated /api/admin/cost-items route and the
// service-role-only weekly digest cron, which has no admin session to
// authenticate with — this takes the already-authorized admin client
// either caller has, rather than each re-deriving the same query.
export async function getCostItemsWithTotal(admin: SupabaseClient) {
  const { data, error } = await admin
    .from('admin_cost_items')
    .select('id, label, category, pricing_note, billing_url, monthly_estimate, billing_frequency, sort_order, updated_at')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('costItems: error loading admin_cost_items', error)
    return { items: [] as any[], monthlyTotal: 0, error: error.message }
  }

  const [liveTwilioCost, liveAiCost] = await Promise.all([fetchLiveTwilioCost(), fetchLiveAiCost(admin)])
  const items = (data || []).map((item) =>
    item.id === 'twilio' && liveTwilioCost !== null
      ? { ...item, monthly_estimate: liveTwilioCost, live: true }
      : item.id === 'claude' && liveAiCost !== null
        ? { ...item, monthly_estimate: liveAiCost, live: true }
        : { ...item, live: false }
  )
  const monthlyTotal = items.reduce((sum, i) => sum + monthlyEquivalent(Number(i.monthly_estimate) || 0, i.billing_frequency), 0)

  return { items, monthlyTotal, error: null as string | null }
}
