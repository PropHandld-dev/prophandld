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
    .select('full_name, zelle_handle, venmo_handle, cashapp_handle')
    .eq('id', ownerId)
    .maybeSingle()

  return NextResponse.json({
    zelle: landlord?.zelle_handle || null,
    venmo: landlord?.venmo_handle || null,
    cashapp: landlord?.cashapp_handle || null,
    landlordName: landlord?.full_name || null,
  })
}
