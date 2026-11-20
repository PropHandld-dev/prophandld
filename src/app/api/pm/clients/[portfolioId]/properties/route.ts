import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership, scopeOwnerIdsForMember, logPmAction } from '@/lib/pm'
import { syncLandlordSubscription } from '@/lib/subscriptionSync'
import { sendPush } from '@/lib/push'
import { checkUsAddress } from '@/lib/addressCheck'

export const maxDuration = 20

const VALID_TYPES = ['residential', 'commercial', 'mixed']

// A PM adding a property to a CLIENT's portfolio. The properties INSERT
// RLS policy only allows owner = primary_landlord_id() (yourself, or the
// landlord you co-own with), which is deliberate -- so this goes through
// service role after verifying the caller actually manages this client.
// Once the property exists under the client, units/tenants/jobs all work
// through the normal pages, since my_landlord_ids() already covers PMs.
export async function POST(request: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const membership = await getPmMembership(admin, user.id)
  if (!membership) {
    return NextResponse.json({ error: 'Only a property management team member can do this' }, { status: 403 })
  }

  const { data: portfolio } = await admin
    .from('pm_client_portfolios')
    .select('id, owner_user_id, status')
    .eq('id', portfolioId)
    .eq('organization_id', membership.organizationId)
    .maybeSingle()
  if (!portfolio || portfolio.status !== 'accepted' || !portfolio.owner_user_id) {
    return NextResponse.json({ error: 'That client hasn\'t accepted your invite yet.' }, { status: 404 })
  }
  // Scoped staff can only act for the clients an admin assigned them.
  const allowed = await scopeOwnerIdsForMember(admin, membership, [portfolio.owner_user_id])
  if (!allowed.includes(portfolio.owner_user_id)) {
    return NextResponse.json({ error: "You're not assigned to this client." }, { status: 403 })
  }
  const ownerId = portfolio.owner_user_id

  const body = (await request.json().catch(() => ({}))) as {
    address?: string
    city?: string
    state?: string
    zip?: string
    propertyType?: string
    numUnits?: number
    lat?: number | null
    lng?: number | null
  }
  const address = body.address?.trim()
  const city = body.city?.trim()
  const state = body.state?.trim()
  const zip = body.zip?.trim()
  if (!address || !city || !state || !zip) {
    return NextResponse.json({ error: 'Address, city, state and ZIP are required.' }, { status: 400 })
  }
  const addressCheck = checkUsAddress({ city, state, zip })
  if (!addressCheck.ok) {
    return NextResponse.json({ error: addressCheck.error }, { status: 400 })
  }
  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: 'ZIP must be 5 digits.' }, { status: 400 })
  }
  const propertyType = VALID_TYPES.includes(body.propertyType || '') ? body.propertyType : 'residential'
  const numUnits = Number(body.numUnits)
  if (!Number.isInteger(numUnits) || numUnits < 1 || numUnits > 50) {
    return NextResponse.json({ error: 'Units must be a whole number from 1 to 50.' }, { status: 400 })
  }

  const { data: property, error: propertyError } = await admin
    .from('properties')
    .insert({
      owner_user_id: ownerId,
      address,
      city,
      state,
      zip,
      property_type: propertyType,
      lat: typeof body.lat === 'number' ? body.lat : null,
      lng: typeof body.lng === 'number' ? body.lng : null,
    })
    .select('id')
    .single()
  if (propertyError || !property) {
    console.error('pm/clients/[portfolioId]/properties: insert failed', propertyError)
    return NextResponse.json({ error: 'Could not create the property.' }, { status: 500 })
  }

  // The OWNER holds the property role, same as if they'd added it
  // themselves; the PM's access comes from the management relationship,
  // so it ends cleanly if that relationship ends.
  const { error: roleError } = await admin
    .from('property_roles')
    .insert({ user_id: ownerId, property_id: property.id, role: 'landlord', granted_by: user.id })
  if (roleError) console.error('pm/clients/[portfolioId]/properties: role insert failed', roleError)

  const units = Array.from({ length: numUnits }, (_, i) => ({
    property_id: property.id,
    unit_number: numUnits === 1 ? 'Main' : `${i + 1}`,
  }))
  const { error: unitsError } = await admin.from('units').insert(units)
  if (unitsError) {
    console.error('pm/clients/[portfolioId]/properties: units insert failed', unitsError)
    return NextResponse.json({ error: 'The property was created, but its units could not be. Add them from the property page.', propertyId: property.id }, { status: 500 })
  }

  // The owner's bill is based on their unit count, so it resyncs for the
  // owner -- and they're told, since a PM just changed what they pay.
  await syncLandlordSubscription(admin, ownerId).catch((err) => console.error('pm/clients/[portfolioId]/properties: subscription sync failed', err))
  await logPmAction(admin, {
    organizationId: membership.organizationId,
    ownerUserId: ownerId,
    actorUserId: user.id,
    action: 'property_added_for_owner',
    detail: `${address}, ${city} (${numUnits} unit${numUnits === 1 ? '' : 's'})`,
  }).catch((err) => console.error('pm/clients/[portfolioId]/properties: audit log failed', err))
  await sendPush(ownerId, {
    title: 'New property added to your portfolio',
    body: `${membership.organizationName} added ${address} (${numUnits} unit${numUnits === 1 ? '' : 's'}).`,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord/properties/${property.id}`,
  }).catch((err) => console.error('pm/clients/[portfolioId]/properties: push failed', err))

  return NextResponse.json({ ok: true, propertyId: property.id })
}
