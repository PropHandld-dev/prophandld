import type { SupabaseClient } from '@supabase/supabase-js'
import { hasAiAssistAccess, AI_ASSIST_ENABLED } from '@/lib/aiAssist'
import { PILOT_FREE } from '@/lib/pilot'

// Who may use an AI feature, and whose account it's counted against.
// Landlords and PMs: their own access. Tenants: their landlord's (that's
// how Prophandld AI has always reached tenants). Contractors: only during
// the free pilot, since nobody pays for their access otherwise.
export async function aiAccessFor(admin: SupabaseClient, user: { id: string; app_metadata?: Record<string, any> }): Promise<{ allowed: boolean; billedUserId: string | null }> {
  if (!AI_ASSIST_ENABLED) return { allowed: false, billedUserId: null }
  const role = user.app_metadata?.role
  if (role === 'renter') {
    const landlordId = await landlordForRenter(admin, user.id)
    if (!landlordId) return { allowed: PILOT_FREE, billedUserId: null }
    return { allowed: await hasAiAssistAccess(admin, landlordId), billedUserId: landlordId }
  }
  if (role === 'contractor') return { allowed: PILOT_FREE, billedUserId: null }
  return { allowed: await hasAiAssistAccess(admin, user.id), billedUserId: user.id }
}

// The owner of the property where this renter (primary or co-renter) has
// an active lease.
async function landlordForRenter(admin: SupabaseClient, renterUserId: string): Promise<string | null> {
  const [{ data: primary }, { data: occupant }] = await Promise.all([
    admin.from('tenancies').select('unit_id').eq('renter_user_id', renterUserId).eq('ended', false).limit(1).maybeSingle(),
    admin.from('tenancy_occupants').select('tenancies(unit_id, ended)').eq('renter_user_id', renterUserId).limit(5),
  ])
  const unitId = primary?.unit_id || ((occupant || []) as any[]).map((o) => o.tenancies).find((t) => t && !t.ended)?.unit_id
  if (!unitId) return null
  const { data: unit } = await admin.from('units').select('properties(owner_user_id)').eq('id', unitId).maybeSingle()
  return (unit as any)?.properties?.owner_user_id || null
}
