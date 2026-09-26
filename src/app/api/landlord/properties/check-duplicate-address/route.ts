import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeAddress } from '@/lib/address'

// A landlord's own client can only ever see their own properties (RLS),
// so catching the same address under a *different* landlord needs a
// service-role check like this one — the same reason tenancy/link-invite
// exists as its own route. Never returns who the other owner is; a
// landlord only ever learns "this address is already registered,"
// never by whom, which is all a fraud/mistake check needs.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { address, city, state, excludePropertyId } = (await request.json()) as {
    address?: string
    city?: string
    state?: string
    excludePropertyId?: string
  }
  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  // No pre-filter beyond the columns needed — normalizeAddress() has to run
  // in JS anyway (suffix/case canonicalizing), so a SQL-side filter on the
  // raw un-normalized text could itself miss the exact match it's meant to
  // catch. Fine at today's table size; worth a narrower query if this ever
  // needs to scale to a very large properties table.
  const { data: candidates, error } = await supabaseAdmin
    .from('properties')
    .select('id, address, city, state, owner_user_id')

  if (error) {
    console.error('check-duplicate-address: query failed', error)
    return NextResponse.json({ error: 'Could not check for duplicates' }, { status: 500 })
  }

  const normalizedNew = normalizeAddress(address)
  const normalizedCity = (city || '').trim().toLowerCase()
  const normalizedState = (state || '').trim().toLowerCase()

  const match = (candidates || []).find(
    (p) =>
      p.id !== excludePropertyId &&
      normalizeAddress(p.address || '') === normalizedNew &&
      (p.city || '').trim().toLowerCase() === normalizedCity &&
      (p.state || '').trim().toLowerCase() === normalizedState
  )

  if (!match) {
    return NextResponse.json({ ownedByMe: false, ownedByOther: false })
  }

  return NextResponse.json({
    ownedByMe: match.owner_user_id === user.id,
    ownedByOther: match.owner_user_id !== user.id,
  })
}
