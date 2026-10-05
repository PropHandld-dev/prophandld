import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Adding a co-renter used to go straight from the browser: look up the
// email, insert into tenancy_occupants, done — with no check at all that
// the account found was actually a renter. Confirmed in testing: a
// contractor's email went in with zero warning, and then showed up
// labeled "Renter" in that unit's job chat. Role lives in app_metadata,
// which only a service-role client can read (see invite-contractor for
// the same pattern), so this has to be a server route, not a client-side
// RPC call.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { tenancyId, email } = (await request.json()) as { tenancyId?: string; email?: string }
  if (!tenancyId || !email?.trim()) {
    return NextResponse.json({ error: 'Missing tenancyId or email' }, { status: 400 })
  }
  const coRenterEmail = email.trim().toLowerCase()

  const supabaseAdmin = getSupabaseAdmin()

  const { data: tenancy, error: tenancyError } = await supabaseAdmin
    .from('tenancies')
    .select('id, occupants, unit_id, units(unit_number, properties(address, owner_user_id))')
    .eq('id', tenancyId)
    .maybeSingle()

  if (tenancyError || !tenancy) {
    return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  }

  const property = (tenancy.units as any)?.properties
  if (property?.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized for this unit' }, { status: 403 })
  }

  const { count: existingOccupants } = await supabaseAdmin
    .from('tenancy_occupants')
    .select('id', { count: 'exact', head: true })
    .eq('tenancy_id', tenancyId)

  const maxCoRenters = tenancy.occupants ? Math.max(tenancy.occupants - 1, 0) : 5
  if ((existingOccupants ?? 0) >= maxCoRenters) {
    return NextResponse.json({ error: 'occupant_limit_reached', maxCoRenters }, { status: 400 })
  }

  const { data: existingUserId } = await supabaseAdmin.rpc('get_user_id_by_email', { email_input: coRenterEmail })

  if (!existingUserId) {
    // No dead end: the caller can offer to send an invite instead.
    return NextResponse.json({ error: 'no_account_found' }, { status: 404 })
  }

  const { data: existingAuthUser } = await supabaseAdmin.auth.admin.getUserById(existingUserId)
  const existingRole = existingAuthUser?.user?.app_metadata?.role

  if (existingRole !== 'renter') {
    return NextResponse.json(
      { error: `This email already has a Prophandld account (as a ${existingRole || 'different role'}), so it can't be added as a co-renter.` },
      { status: 400 }
    )
  }

  const { error: insertError } = await supabaseAdmin
    .from('tenancy_occupants')
    .insert({ tenancy_id: tenancyId, renter_user_id: existingUserId })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'already_co_renter' }, { status: 400 })
    }
    console.error('co-renter/add: insert failed', insertError)
    return NextResponse.json({ error: 'Could not add co-renter' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
