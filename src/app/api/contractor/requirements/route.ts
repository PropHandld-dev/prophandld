import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requirementsFor } from '@/lib/credentialRequirements'
import { STATE_BOARDS } from '@/lib/stateLicensingBoards'
import { computeServiceArea } from '@/lib/contractorServiceArea'

// Which licenses/registrations/insurance apply to this contractor, based on
// the trades they offer and every state inside their service radius — the
// license that matters depends on where the job is, and a contractor near a
// state line works on both sides of it. Runs server-side because the ZIP
// data lives in the Node-only `zipcodes` package.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.user_metadata?.role !== 'contractor') {
    return NextResponse.json({ error: 'Only contractors have requirements' }, { status: 403 })
  }

  const { data: profile, error } = await getSupabaseAdmin()
    .from('users')
    .select('service_categories, service_zip, service_radius_miles')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    console.error('contractor/requirements: profile lookup failed', error)
    return NextResponse.json({ error: 'Could not load your profile' }, { status: 500 })
  }

  const categories: string[] = profile?.service_categories || []
  const { homeState, homeCity, radiusMiles, states, cities } = computeServiceArea(profile?.service_zip, profile?.service_radius_miles)

  const { requirements, unmappedStates } = requirementsFor({ states, cities, categories })

  return NextResponse.json({
    homeState,
    homeCity,
    radiusMiles,
    states: [...states].sort(),
    categories,
    requirements,
    boards: unmappedStates.map((s) => STATE_BOARDS[s]).filter(Boolean),
  })
}
