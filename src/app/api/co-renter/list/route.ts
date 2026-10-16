import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 15

// Powers a "Your household" card on the renter's Profile page — until now,
// a co-renter (or the primary tenant) had no way to see who else is on
// the lease outside of inferring it from job chat participants. Read-only
// by design: adding/removing a co-renter stays a landlord action from the
// unit page, same as today.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // get_my_active_tenancy_id() is security-definer against auth.uid(), so
  // it has to run on the caller's own session, not the service-role client.
  const { data: tenancyId } = await authClient.rpc('get_my_active_tenancy_id')
  if (!tenancyId) {
    return NextResponse.json({ tenancyId: null })
  }

  const admin = getSupabaseAdmin()

  const [{ data: tenancy }, { data: occupants }] = await Promise.all([
    admin.from('tenancies').select('renter_user_id, units(unit_number, properties(address))').eq('id', tenancyId).maybeSingle(),
    admin.from('tenancy_occupants').select('renter_user_id, added_at').eq('tenancy_id', tenancyId).order('added_at', { ascending: true }),
  ])

  if (!tenancy) {
    return NextResponse.json({ tenancyId: null })
  }

  const unit = tenancy.units as any
  const unitLabel = unit ? `${unit.properties?.address || 'your unit'}${unit.unit_number ? `, Unit ${unit.unit_number}` : ''}` : 'your unit'

  const allIds = Array.from(new Set([tenancy.renter_user_id, ...(occupants || []).map((o) => o.renter_user_id)]))
  const { data: people } = await admin.from('users').select('id, full_name, email').in('id', allIds)
  const byId = new Map((people || []).map((p: any) => [p.id, p]))

  return NextResponse.json({
    tenancyId,
    unitLabel,
    isPrimary: tenancy.renter_user_id === user.id,
    primary: {
      id: tenancy.renter_user_id,
      name: byId.get(tenancy.renter_user_id)?.full_name || byId.get(tenancy.renter_user_id)?.email || 'Primary tenant',
      isYou: tenancy.renter_user_id === user.id,
    },
    coRenters: (occupants || []).map((o) => ({
      id: o.renter_user_id,
      name: byId.get(o.renter_user_id)?.full_name || byId.get(o.renter_user_id)?.email || 'Co-renter',
      isYou: o.renter_user_id === user.id,
    })),
  })
}
