import type { SupabaseClient } from '@supabase/supabase-js'

// Every renter (primary tenant + any co-renter) with an active tenancy
// anywhere across a landlord's properties. Used to fan a notification out
// to renters directly, independent of the landlord's own account — the
// point being a second, independent set of eyes: if a landlord's account
// is compromised, an alert that only reaches that same (possibly
// compromised) account's email isn't much of a safeguard, but a renter
// getting an unexpected "your landlord's payment info changed" notice has
// their own money on the line and a real reason to double-check before
// paying.
export async function getActiveRenterIds(admin: SupabaseClient, landlordUserId: string): Promise<string[]> {
  const { data: properties } = await admin.from('properties').select('id').eq('owner_user_id', landlordUserId)
  const propertyIds = (properties || []).map((p) => p.id)
  if (propertyIds.length === 0) return []

  const { data: units } = await admin.from('units').select('id').in('property_id', propertyIds)
  const unitIds = (units || []).map((u) => u.id)
  if (unitIds.length === 0) return []

  const { data: tenancies } = await admin
    .from('tenancies')
    .select('id, renter_user_id')
    .in('unit_id', unitIds)
    .eq('ended', false)
  const tenancyIds = (tenancies || []).map((t) => t.id)
  const renterIds = (tenancies || []).map((t) => t.renter_user_id).filter(Boolean)

  if (tenancyIds.length > 0) {
    const { data: occupants } = await admin
      .from('tenancy_occupants')
      .select('renter_user_id')
      .in('tenancy_id', tenancyIds)
    renterIds.push(...(occupants || []).map((o) => o.renter_user_id).filter(Boolean))
  }

  return [...new Set(renterIds)]
}
