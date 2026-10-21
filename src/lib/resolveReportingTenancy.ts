import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyRenterIds } from '@/lib/coRenters'

// Given a job (needs unit_id and reported_by), resolves every user id a
// renter-facing notification about it should reach: the tenancy that
// actually reported it (checked as both primary renter and co-renter), not
// just whoever currently lives in the unit — those can genuinely differ. A
// job can still be open (pending_review, a schedule proposal, a dispute)
// after the reporting tenant moves out and a new one moves in; the old
// "whoever's tenancy is currently active" lookup silently handed every
// detail of an older job (including access_notes and dispute content) to
// that new, uninvolved occupant, while the person who actually filed it
// lost all visibility the moment their own tenancy ended. Shared by
// api/notify, api/disputes/raise, and api/disputes/resolve, which all had
// this exact gap independently.
export async function resolveReportingRenterIds(
  admin: SupabaseClient,
  job: { unit_id: string; reported_by?: string | null }
): Promise<string[]> {
  let tenancyId: string | null = null
  let primaryRenterUserId: string | null = null

  if (job.reported_by) {
    const { data: asPrimary } = await admin
      .from('tenancies')
      .select('id, renter_user_id')
      .eq('unit_id', job.unit_id)
      .eq('renter_user_id', job.reported_by)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (asPrimary) {
      tenancyId = asPrimary.id
      primaryRenterUserId = asPrimary.renter_user_id
    } else {
      const { data: occupantRows } = await admin
        .from('tenancy_occupants')
        .select('tenancy_id, tenancies(renter_user_id, unit_id)')
        .eq('renter_user_id', job.reported_by)
      const match = (occupantRows || []).find((o: any) => o.tenancies?.unit_id === job.unit_id)
      if (match) {
        tenancyId = match.tenancy_id
        primaryRenterUserId = (match.tenancies as any)?.renter_user_id || job.reported_by
      }
    }
  }

  // Fallback for a job reported before this column existed, or if that
  // lookup came up empty for some other reason — whoever currently lives
  // there is better than notifying nobody.
  if (!tenancyId) {
    const { data: tenancy } = await admin
      .from('tenancies')
      .select('id, renter_user_id')
      .eq('unit_id', job.unit_id)
      .eq('ended', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (tenancy) {
      tenancyId = tenancy.id
      primaryRenterUserId = tenancy.renter_user_id
    }
  }

  if (!tenancyId || !primaryRenterUserId) return []
  return notifyRenterIds(admin, tenancyId, primaryRenterUserId)
}
