import { tierForUnitCount, type LandlordTier } from '@/lib/pricingTiers'

// The tier ordering ach_fee_absorption's min_tier checks against — not
// exported from pricingTiers.ts itself since nothing there needed an
// ordinal comparison before this.
const TIER_ORDER: LandlordTier[] = ['free', 'starter', 'growth', 'portfolio', 'enterprise']

export type AppSettingKey = 'ach_fee_absorption' | 'card_surcharge' | 'ach_flat_fee_fallback'

export interface AchFeeAbsorptionSetting {
  enabled: boolean
  expires_at?: string | null
  min_tier?: LandlordTier | null
}

export async function getAppSetting<T = Record<string, unknown>>(supabaseAdmin: any, key: AppSettingKey): Promise<T | null> {
  const { data } = await supabaseAdmin.from('app_settings').select('value').eq('key', key).maybeSingle()
  return (data?.value as T) ?? null
}

// A landlord's own units count, the same counting query subscription/status
// already uses — duplicated rather than imported since that route computes
// several other subscription fields this doesn't need.
async function unitCountForLandlord(supabaseAdmin: any, landlordUserId: string): Promise<number> {
  const { data: properties } = await supabaseAdmin.from('properties').select('id').eq('owner_user_id', landlordUserId)
  const propertyIds = (properties || []).map((p: { id: string }) => p.id)
  if (propertyIds.length === 0) return 0
  const { count } = await supabaseAdmin.from('units').select('id', { count: 'exact', head: true }).in('property_id', propertyIds)
  return count || 0
}

// Whether ACH's processing fee should be absorbed by Prophandld (no
// surcharge on the tenant) for this specific landlord, right now. A
// per-landlord override always wins; otherwise falls back to the global
// flag, its expiry, and its tier floor.
export async function isAchFeeAbsorbed(supabaseAdmin: any, landlordUserId: string): Promise<boolean> {
  const { data: landlordRow } = await supabaseAdmin
    .from('users')
    .select('ach_fee_absorption_override')
    .eq('id', landlordUserId)
    .maybeSingle()

  if (landlordRow?.ach_fee_absorption_override === true) return true
  if (landlordRow?.ach_fee_absorption_override === false) return false

  const setting = await getAppSetting<AchFeeAbsorptionSetting>(supabaseAdmin, 'ach_fee_absorption')
  if (!setting?.enabled) return false
  if (setting.expires_at && new Date(setting.expires_at) < new Date()) return false

  if (setting.min_tier) {
    const unitCount = await unitCountForLandlord(supabaseAdmin, landlordUserId)
    const landlordTierIndex = TIER_ORDER.indexOf(tierForUnitCount(unitCount))
    const minTierIndex = TIER_ORDER.indexOf(setting.min_tier)
    if (landlordTierIndex < minTierIndex) return false
  }

  return true
}
