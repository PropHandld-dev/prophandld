import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Returns whichever Zelle/Venmo/Cash App handles the renter's own landlord
// has set, so renter/rent/page.tsx can show them as payment options. Goes
// through the service-role admin client (same pattern as co-renter/list)
// rather than a direct client-side query — there's no existing precedent
// for a renter reading another user's row client-side, and no need to
// introduce a new RLS policy just to expose three text fields.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Security-definer, tied to auth.uid() — called via the caller's own
  // session so it only ever resolves the caller's own tenancy.
  const { data: tenancyId } = await authClient.rpc('get_my_active_tenancy_id')
  if (!tenancyId) {
    return NextResponse.json({ zelle: null, venmo: null, cashapp: null, landlordName: null })
  }

  const admin = getSupabaseAdmin()
  const { data: tenancy } = await admin
    .from('tenancies')
    .select('units(properties(owner_user_id))')
    .eq('id', tenancyId)
    .maybeSingle()

  const ownerId = (tenancy?.units as any)?.properties?.owner_user_id
  if (!ownerId) {
    return NextResponse.json({ zelle: null, venmo: null, cashapp: null, landlordName: null })
  }

  const { data: landlord } = await admin
    .from('users')
    .select('full_name, zelle_handle, venmo_handle, cashapp_handle, p2p_handles_frozen_until')
    .eq('id', ownerId)
    .maybeSingle()

  // A change to an already-set handle freezes it from renters for 48
  // hours (see api/profile/p2p-handles) — the same window the landlord's
  // alert email/push gives them to notice and report it if it wasn't them,
  // before a renter could actually see and pay a possibly-hijacked handle.
  const frozen = !!landlord?.p2p_handles_frozen_until && new Date(landlord.p2p_handles_frozen_until) > new Date()

  return NextResponse.json({
    zelle: frozen ? null : landlord?.zelle_handle || null,
    venmo: frozen ? null : landlord?.venmo_handle || null,
    cashapp: frozen ? null : landlord?.cashapp_handle || null,
    landlordName: landlord?.full_name || null,
  })
}
