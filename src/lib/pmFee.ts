import type { SupabaseClient } from '@supabase/supabase-js'
import { rentMonthBounds } from '@/lib/rentAutomation'

export type FeePortfolio = {
  owner_user_id: string | null
  management_fee: number | null
  management_fee_type: 'flat' | 'percent_of_rent' | null
  management_fee_percent: number | null
}

// Shared by the manual "Pay now" route and cron/pm-fee-billing so the two
// charge paths can never silently disagree on what a percent-of-rent
// portfolio actually owes. Percent is computed against rent actually
// collected in the last full calendar month (not the current, still-in-
// progress one) — the same period a landlord's own rent statement would
// show as "last month," so the number on the Stripe charge matches what
// they'd expect to see if they went and checked.
export async function computeManagementFeeAmount(admin: SupabaseClient, portfolio: FeePortfolio): Promise<number> {
  if (portfolio.management_fee_type === 'percent_of_rent') {
    if (!portfolio.management_fee_percent || portfolio.management_fee_percent <= 0 || !portfolio.owner_user_id) return 0

    const { data: properties } = await admin.from('properties').select('id').eq('owner_user_id', portfolio.owner_user_id).eq('archived', false)
    const propertyIds = (properties || []).map((p: any) => p.id)
    if (propertyIds.length === 0) return 0

    const { data: units } = await admin.from('units').select('id').in('property_id', propertyIds)
    const unitIds = (units || []).map((u: any) => u.id)
    if (unitIds.length === 0) return 0

    const { data: tenancies } = await admin.from('tenancies').select('id').in('unit_id', unitIds)
    const tenancyIds = (tenancies || []).map((t: any) => t.id)
    if (tenancyIds.length === 0) return 0

    const { month, following } = rentMonthBounds(-1)
    const { data: payments } = await admin
      .from('rent_payments')
      .select('actual_amount')
      .in('tenancy_id', tenancyIds)
      .gte('month', month)
      .lt('month', following)

    const collected = (payments || []).reduce((sum: number, p: any) => sum + Number(p.actual_amount || 0), 0)
    return Math.round(collected * (portfolio.management_fee_percent / 100) * 100) / 100
  }

  return Number(portfolio.management_fee || 0)
}
