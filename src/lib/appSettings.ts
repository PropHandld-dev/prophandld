import { type LandlordTier } from '@/lib/pricingTiers'

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

// Whether Prophandld pays the bank-transfer (ACH) fee on this landlord's
// rent, so the tenant pays exactly the rent.
export async function isAchFeeAbsorbed(supabaseAdmin: any, landlordUserId: string): Promise<boolean> {
  const { data: landlordRow } = await supabaseAdmin
    .from('users')
    .select('ach_fee_absorption_override')
    .eq('id', landlordUserId)
    .maybeSingle()

  if (landlordRow?.ach_fee_absorption_override === true) return true
  if (landlordRow?.ach_fee_absorption_override === false) return false

  // Decided 2026-11-17: Prophandld always pays the bank-transfer fee on
  // rent, so tenants pay exactly their rent. Only a per-landlord override
  // above can turn it off.
  return true
}
