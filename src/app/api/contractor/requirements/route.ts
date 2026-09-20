import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import zipcodes from 'zipcodes'
import { requirementsFor } from '@/lib/credentialRequirements'

// Which licenses/registrations/insurance apply to this contractor, based on
// the trades they offer and where their service ZIP is. Runs server-side
// because the ZIP→state/city data lives in the Node-only `zipcodes` package.
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
    .select('service_categories, service_zip')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    console.error('contractor/requirements: profile lookup failed', error)
    return NextResponse.json({ error: 'Could not load your profile' }, { status: 500 })
  }

  const categories: string[] = profile?.service_categories || []
  const location = profile?.service_zip ? zipcodes.lookup(profile.service_zip) : null
  const state = location?.state || null
  const city = location?.city || null

  const { requirements, coverage } = requirementsFor({ state, city, categories })

  return NextResponse.json({
    state,
    city,
    categories,
    coverage,
    requirements,
  })
}
