import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 15

// Public profile data for one PM company's shareable page. Only ever
// returns what's safe for a logged-out stranger to see: no client
// names, no financial figures, no emails -- just the company's own
// pitch, aggregate counts, and reviews (reviewer shown by first name
// only, not full identity).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = getSupabaseAdmin()

  const { data: org } = await admin
    .from('pm_organizations')
    .select('id, name, pitch, open_to_clients')
    .eq('slug', slug)
    .maybeSingle()

  if (!org || !org.open_to_clients) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Fire-and-forget: a view is counted on every real page load, including
  // the org's own admin checking their own profile -- there's no session
  // on this public route to tell the difference, and a simple honest
  // "page loads" count is the right scope for this, not a full analytics
  // rebuild with bot filtering or self-view exclusion.
  admin.from('pm_profile_views').insert({ organization_id: org.id }).then(() => {}, () => {})

  const [{ data: portfolios }, { data: reviews }] = await Promise.all([
    admin.from('pm_client_portfolios').select('owner_user_id').eq('organization_id', org.id).eq('status', 'accepted'),
    admin
      .from('pm_reviews')
      .select('rating, comment, created_at, reviewer:reviewer_user_id(full_name)')
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const ownerIds = (portfolios || []).map((p: any) => p.owner_user_id)
  let unitCount = 0
  if (ownerIds.length > 0) {
    const { data: properties } = await admin.from('properties').select('id').in('owner_user_id', ownerIds).eq('archived', false)
    const propertyIds = (properties || []).map((p) => p.id)
    if (propertyIds.length > 0) {
      const { count } = await admin.from('units').select('id', { count: 'exact', head: true }).in('property_id', propertyIds)
      unitCount = count || 0
    }
  }

  const ratings = (reviews || []).map((r: any) => r.rating as number)
  const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null

  return NextResponse.json({
    name: org.name,
    pitch: org.pitch,
    clientCount: ownerIds.length,
    unitCount,
    avgRating,
    reviews: (reviews || []).map((r: any) => ({
      rating: r.rating,
      comment: r.comment,
      createdAt: r.created_at,
      reviewerFirstName: (r.reviewer?.full_name || 'A client').split(' ')[0],
    })),
  })
}
