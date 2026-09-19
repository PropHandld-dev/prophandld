import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import zipcodes from 'zipcodes'

// Replaces the old exact-ZIP-match RPC with radius matching — a
// contractor sees jobs within their configured travel radius of their
// home ZIP, not just an exact ZIP match. Runs server-side (not a DB
// function) since the `zipcodes` package's US ZIP centroid data lives
// in the Node runtime, not Postgres — keeps the whole matching layer
// out of the database rather than needing to load ~40k ZIP rows there.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.user_metadata?.role !== 'contractor') {
    return NextResponse.json({ error: 'Only contractors have available jobs' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('service_categories, service_zip, service_radius_miles')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      console.error('available-jobs: error fetching contractor profile', profileError)
      return NextResponse.json({ error: 'Could not load your profile' }, { status: 500 })
    }

    const categories: string[] = profile?.service_categories || []
    const contractorZip = profile?.service_zip
    const radiusMiles = profile?.service_radius_miles || 25

    if (categories.length === 0 || !contractorZip) {
      return NextResponse.json({ jobs: [] })
    }

    const { data: candidates, error: jobsError } = await supabaseAdmin
      .from('jobs')
      .select('id, category, description, is_emergency, created_at, units(unit_number, properties(address, city, state, zip))')
      .eq('status', 'bidding')
      .in('category', categories)
      .order('created_at', { ascending: false })

    if (jobsError) {
      console.error('available-jobs: error fetching candidate jobs', jobsError)
      return NextResponse.json({ error: 'Could not load jobs' }, { status: 500 })
    }

    // Excludes jobs with an active (non-declined) bid only — a job that
    // reopened for bidding after the winning contractor cancelled should
    // let a previously-declined bidder see and re-bid on it, not lock
    // them out forever because of a bid row from the earlier round.
    const { data: existingBids, error: bidsError } = await supabaseAdmin
      .from('bids')
      .select('job_id')
      .eq('contractor_user_id', user.id)
      .neq('status', 'declined')

    if (bidsError) {
      console.error('available-jobs: error fetching existing bids', bidsError)
      return NextResponse.json({ error: 'Could not load your bids' }, { status: 500 })
    }

    const alreadyBidJobIds = new Set((existingBids || []).map((b) => b.job_id))

    const jobs = (candidates || [])
      .filter((job) => !alreadyBidJobIds.has(job.id))
      .map((job) => {
        const unit = job.units as any
        const property = unit?.properties
        const jobZip = property?.zip
        let distance: number | null = null
        if (jobZip) {
          try {
            distance = zipcodes.distance(contractorZip, jobZip)
          } catch (err) {
            console.error('available-jobs: distance calc failed', { contractorZip, jobZip, err })
          }
        }
        return {
          id: job.id,
          category: job.category,
          description: job.description,
          is_emergency: job.is_emergency,
          created_at: job.created_at,
          address: property?.address ?? null,
          city: property?.city ?? null,
          state: property?.state ?? null,
          unit_number: unit?.unit_number ?? null,
          distance,
        }
      })
      .filter((job) => job.distance !== null && job.distance <= radiusMiles)

    return NextResponse.json({ jobs })
  } catch (err) {
    console.error('available-jobs: unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
