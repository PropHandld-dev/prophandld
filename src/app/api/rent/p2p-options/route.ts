import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveRentPayee } from '@/lib/rentRouting'

// Returns whichever Zelle/Venmo/Cash App handles the renter's own landlord
// has set, so renter/rent/page.tsx can show them as payment options. Goes
// through the service-role admin client (same pattern as co-renter/list)
// rather than a direct client-side query — there's no existing precedent
// for a renter reading another user's row client-side, and no need to
// introduce a new RLS policy just to expose three text fields.
//
// Also returns the renter's own saved `default_rent_payment_method` — read
// straight off their own row via the caller's session (already
// RLS-permitted, no admin client needed for that part) — so the pay modal
// can pre-highlight their usual choice without a second round trip.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: ownRow } = await authClient
    .from('users')
    .select('default_rent_payment_method')
    .eq('id', user.id)
    .maybeSingle()
  const defaultMethod = ownRow?.default_rent_payment_method || null

  // Security-definer, tied to auth.uid() — called via the caller's own
  // session so it only ever resolves the caller's own tenancy.
  const { data: tenancyId } = await authClient.rpc('get_my_active_tenancy_id')
  if (!tenancyId) {
    return NextResponse.json({ zelle: null, venmo: null, cashapp: null, landlordName: null, defaultMethod, acceptBank: true, acceptCard: true })
  }

  const admin = getSupabaseAdmin()
  const { data: tenancy } = await admin
    .from('tenancies')
    .select('units(properties(owner_user_id))')
    .eq('id', tenancyId)
    .maybeSingle()

  const ownerId = (tenancy?.units as any)?.properties?.owner_user_id
  if (!ownerId) {
    return NextResponse.json({ zelle: null, venmo: null, cashapp: null, landlordName: null, defaultMethod, acceptBank: true, acceptCard: true })
  }

  // Whoever actually receives this rent: the owner, or their PM when the
  // owner approved rent collection (rentRouting.ts).
  const payee = await resolveRentPayee(admin, ownerId)
  const { data: landlord } = await admin
    .from('users')
    .select('full_name, zelle_handle, venmo_handle, cashapp_handle, p2p_handles_frozen_until, rent_check_payable_to, rent_check_mail_address, rent_cash_instructions, rent_accept_bank, rent_accept_card')
    .eq('id', payee.userId)
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
    landlordName: payee.side === 'pm' ? payee.orgName || landlord?.full_name || null : landlord?.full_name || null,
    defaultMethod,
    check: frozen || !landlord?.rent_check_mail_address ? null : { payableTo: landlord.rent_check_payable_to || landlord.full_name || '', mailTo: landlord.rent_check_mail_address },
    cash: frozen ? null : landlord?.rent_cash_instructions || null,
    acceptBank: landlord?.rent_accept_bank !== false,
    acceptCard: landlord?.rent_accept_card !== false,
  })
}
