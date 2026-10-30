import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requirementById } from '@/lib/credentialRequirements'

async function requireLandlord(): Promise<{ id: string } | NextResponse> {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords can do this' }, { status: 403 })
  }
  return { id: user.id }
}

// GET without ?details=1 is the cheap version (just the ids), used by the
// job detail page to light up the star on contractors already favorited —
// no point enriching with ratings/badges just to check that. The "My
// Contractors" list page asks for ?details=1 and gets the full picture.
export async function GET(request: NextRequest) {
  const landlord = await requireLandlord()
  if (landlord instanceof NextResponse) return landlord
  const admin = getSupabaseAdmin()

  const { data: favorites } = await admin
    .from('favorite_contractors')
    .select('contractor_user_id, created_at')
    .eq('landlord_user_id', landlord.id)
    .order('created_at', { ascending: false })
  const contractorIds = (favorites || []).map((f) => f.contractor_user_id)

  if (request.nextUrl.searchParams.get('details') !== '1' || contractorIds.length === 0) {
    return NextResponse.json({ contractorIds, contractors: [] })
  }

  const [{ data: users }, { data: verifsData }, { data: credData }, summaries] = await Promise.all([
    admin.from('users').select('id, full_name, service_categories').in('id', contractorIds),
    admin.from('contractor_verifications').select('contractor_user_id, status').in('contractor_user_id', contractorIds),
    admin.from('contractor_credentials').select('contractor_user_id, requirement_id, expiry').eq('status', 'verified').in('contractor_user_id', contractorIds),
    Promise.all(
      contractorIds.map(async (id) => {
        const { data } = await admin.rpc('get_contractor_rating_summary', { target_contractor_id: id }).maybeSingle()
        return [id, data as { avg_rating: number; review_count: number } | null] as const
      })
    ),
  ])

  const usersById = new Map((users || []).map((u) => [u.id, u]))
  const verifiedIds = new Set((verifsData || []).filter((v) => v.status === 'verified').map((v) => v.contractor_user_id))
  const unlicensedIds = new Set((verifsData || []).filter((v) => v.status === 'unlicensed').map((v) => v.contractor_user_id))
  const badgesByContractor = new Map<string, string[]>()
  for (const c of credData || []) {
    if (c.expiry && new Date(c.expiry + 'T00:00:00').getTime() < Date.now()) continue
    const label = requirementById(c.requirement_id)?.badge
    if (!label) continue
    const list = badgesByContractor.get(c.contractor_user_id) || []
    list.push(label)
    badgesByContractor.set(c.contractor_user_id, list)
  }
  const ratingByContractor = new Map(summaries.filter(([, data]) => data && data.review_count > 0))

  const contractors = (favorites || []).map((f) => {
    const id = f.contractor_user_id
    const u = usersById.get(id)
    return {
      id,
      fullName: u?.full_name || null,
      serviceCategories: u?.service_categories || [],
      verified: verifiedIds.has(id),
      unlicensed: unlicensedIds.has(id),
      credentialBadges: badgesByContractor.get(id) || [],
      rating: ratingByContractor.get(id) || null,
      favoritedAt: f.created_at,
    }
  })

  return NextResponse.json({ contractorIds, contractors })
}

export async function POST(request: NextRequest) {
  const landlord = await requireLandlord()
  if (landlord instanceof NextResponse) return landlord
  const admin = getSupabaseAdmin()

  const { contractorUserId } = (await request.json()) as { contractorUserId?: string }
  if (!contractorUserId || typeof contractorUserId !== 'string') {
    return NextResponse.json({ error: 'contractorUserId is required' }, { status: 400 })
  }

  // A landlord can only save a contractor they've actually had an accepted
  // bid from on one of their own properties — not an arbitrary user id.
  const { data: properties } = await admin.from('properties').select('id').eq('owner_user_id', landlord.id)
  const propertyIds = (properties || []).map((p) => p.id)
  const { data: units } = propertyIds.length
    ? await admin.from('units').select('id').in('property_id', propertyIds)
    : { data: [] }
  const unitIds = (units || []).map((u) => u.id)
  const { data: jobs } = unitIds.length
    ? await admin.from('jobs').select('id').in('unit_id', unitIds)
    : { data: [] }
  const jobIds = (jobs || []).map((j) => j.id)

  const { count } = jobIds.length
    ? await admin
        .from('bids')
        .select('id', { count: 'exact', head: true })
        .eq('contractor_user_id', contractorUserId)
        .eq('status', 'accepted')
        .in('job_id', jobIds)
    : { count: 0 }

  if (!count) {
    return NextResponse.json({ error: "You can only save a contractor you've worked with" }, { status: 403 })
  }

  const { error } = await admin
    .from('favorite_contractors')
    .upsert({ landlord_user_id: landlord.id, contractor_user_id: contractorUserId }, { onConflict: 'landlord_user_id,contractor_user_id' })
  if (error) {
    console.error('favorite-contractors: insert failed', error)
    return NextResponse.json({ error: 'Could not save this contractor' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const landlord = await requireLandlord()
  if (landlord instanceof NextResponse) return landlord
  const admin = getSupabaseAdmin()

  const { contractorUserId } = (await request.json()) as { contractorUserId?: string }
  if (!contractorUserId || typeof contractorUserId !== 'string') {
    return NextResponse.json({ error: 'contractorUserId is required' }, { status: 400 })
  }

  const { error } = await admin
    .from('favorite_contractors')
    .delete()
    .eq('landlord_user_id', landlord.id)
    .eq('contractor_user_id', contractorUserId)
  if (error) {
    console.error('favorite-contractors: delete failed', error)
    return NextResponse.json({ error: 'Could not remove this contractor' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
