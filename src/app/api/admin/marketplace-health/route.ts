import { NextResponse } from 'next/server'
import zipcodes from 'zipcodes'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { fetchAllPagesOrEmpty } from '@/lib/pagedQuery'

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
const ID_CHUNK = 100

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// The one question a bootstrapped two-sided marketplace actually needs
// answered: is there enough contractor coverage where the landlords are,
// and once a job opens for bidding, does it actually get a bid fast? A
// landlord who checks back to zero bids in a few hours is a landlord who
// assumes the app is empty and doesn't come back — this is what tells you
// which ZIP codes need contractor recruiting BEFORE landlord marketing,
// instead of guessing.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const admin = getSupabaseAdmin()

  // --- Coverage: for every ZIP with at least one landlord property, how
  // many contractors could actually see a job posted there (their own
  // travel radius from their own ZIP, the same matching openJobAlerts.ts
  // uses for real alerts, not just an exact ZIP match) ---
  const properties = await fetchAllPagesOrEmpty<{ zip: string | null; owner_user_id: string }>((from, to) =>
    admin.from('properties').select('zip, owner_user_id').range(from, to)
  )
  const contractorRows = await fetchAllPagesOrEmpty<{ id: string; service_zip: string | null; service_radius_miles: number | null }>((from, to) =>
    admin.from('users').select('id, service_zip, service_radius_miles').not('service_zip', 'is', null).range(from, to)
  )

  // `public.users` has no role column — leftover service_zip values from a
  // role switch or an old test account would otherwise inflate coverage
  // with accounts that aren't really contractors anymore. Same gap this
  // app hit before with contractor job alerts.
  const roleChecks = await Promise.all(
    contractorRows.map((c) =>
      admin.auth.admin.getUserById(c.id).catch((err) => {
        // Swallowed on purpose (one failed lookup shouldn't fail the whole
        // page), but logged rather than silently dropped — a rate limit
        // or transient failure here quietly understates coverage with
        // nothing visible to the admin viewing the page otherwise.
        console.error('marketplace-health: getUserById failed', c.id, err)
        return null
      })
    )
  )
  const contractors = contractorRows.filter((_, i) => roleChecks[i]?.data?.user?.app_metadata?.role === 'contractor')

  const zipStats = new Map<string, { landlords: Set<string>; contractors: Set<string> }>()
  for (const p of properties) {
    const zip = p.zip ? String(p.zip).slice(0, 5) : null
    if (!zip) continue
    if (!zipStats.has(zip)) zipStats.set(zip, { landlords: new Set(), contractors: new Set() })
    zipStats.get(zip)!.landlords.add(p.owner_user_id)
  }
  for (const zip of zipStats.keys()) {
    for (const c of contractors) {
      if (!c.service_zip) continue
      const miles = zipcodes.distance(String(c.service_zip).slice(0, 5), zip) as number | null | undefined
      if (miles !== null && miles !== undefined && miles <= (c.service_radius_miles || 25)) {
        zipStats.get(zip)!.contractors.add(c.id)
      }
    }
  }

  const coverage = Array.from(zipStats.entries())
    .map(([zip, s]) => ({
      zip,
      landlordCount: s.landlords.size,
      contractorCount: s.contractors.size,
      ratio: s.landlords.size > 0 ? s.contractors.size / s.landlords.size : null,
    }))
    .sort((a, b) => (a.ratio ?? -1) - (b.ratio ?? -1) || b.landlordCount - a.landlordCount)

  // --- Responsiveness: of jobs that actually opened for bidding (only
  // counts jobs since bidding_opened_at started being recorded — older
  // jobs have no timestamp and are excluded rather than counted as
  // failures), what share got a first bid within 4 hours ---
  const jobs = await fetchAllPagesOrEmpty<{ id: string; bidding_opened_at: string | null }>((from, to) =>
    admin.from('jobs').select('id, bidding_opened_at').not('bidding_opened_at', 'is', null).range(from, to)
  )

  const firstBidByJob = new Map<string, string>()
  for (const ids of chunk(jobs.map((j) => j.id), ID_CHUNK)) {
    const bids = await fetchAllPagesOrEmpty<{ job_id: string; created_at: string }>((from, to) =>
      admin.from('bids').select('job_id, created_at').in('job_id', ids).order('created_at', { ascending: true }).range(from, to)
    )
    for (const b of bids) {
      if (!firstBidByJob.has(b.job_id)) firstBidByJob.set(b.job_id, b.created_at)
    }
  }

  let withinFourHours = 0
  let gotAnyBid = 0
  for (const j of jobs) {
    const firstBid = firstBidByJob.get(j.id)
    if (!firstBid || !j.bidding_opened_at) continue
    gotAnyBid++
    if (new Date(firstBid).getTime() - new Date(j.bidding_opened_at).getTime() <= FOUR_HOURS_MS) withinFourHours++
  }

  return NextResponse.json({
    coverage,
    responsiveness: { eligibleJobs: jobs.length, gotAnyBid, withinFourHours },
  })
}
