import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import zipcodes from 'zipcodes'
import { requirementsFor } from '@/lib/credentialRequirements'
import { STATE_BOARDS } from '@/lib/stateLicensingBoards'

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
  const radiusMiles = Math.min(profile?.service_radius_miles || 25, 100)
  const home = profile?.service_zip ? zipcodes.lookup(profile.service_zip) : null

  const states = new Set<string>()
  const cities = new Map<string, { state: string; city: string }>()
  if (home?.state) {
    states.add(home.state)
    cities.set(`${home.state}:${home.city}`, { state: home.state, city: home.city })
    const nearby = (zipcodes.radius(profile!.service_zip, radiusMiles) as string[]) || []
    for (const zip of nearby) {
      const place = zipcodes.lookup(zip)
      if (!place?.state) continue
      states.add(place.state)
      cities.set(`${place.state}:${place.city}`, { state: place.state, city: place.city })
    }
  }

  const { requirements, unmappedStates } = requirementsFor({
    states: Array.from(states),
    cities: Array.from(cities.values()),
    categories,
  })

  return NextResponse.json({
    homeState: home?.state || null,
    homeCity: home?.city || null,
    radiusMiles,
    states: Array.from(states).sort(),
    categories,
    requirements,
    boards: unmappedStates.map((s) => STATE_BOARDS[s]).filter(Boolean),
  })
}
