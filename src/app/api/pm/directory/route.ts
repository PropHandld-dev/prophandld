import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 15

// Public, no auth required -- a browsable list of PM companies open to
// new clients, served through a service-role route rather than direct
// RLS since pm_organizations' only SELECT policy requires an existing
// org membership, which a visitor just browsing has none of.
export async function GET() {
  const admin = getSupabaseAdmin()

  const { data: orgs } = await admin
    .from('pm_organizations')
    .select('id, slug, name, pitch')
    .eq('open_to_clients', true)
    .not('slug', 'is', null)

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ organizations: [] })
  }

  const orgIds = orgs.map((o) => o.id)

  const [{ data: portfolios }, { data: reviews }] = await Promise.all([
    admin.from('pm_client_portfolios').select('organization_id').in('organization_id', orgIds).eq('status', 'accepted'),
    admin.from('pm_reviews').select('organization_id, rating').in('organization_id', orgIds),
  ])

  const clientCountByOrg = new Map<string, number>()
  for (const p of (portfolios || []) as any[]) clientCountByOrg.set(p.organization_id, (clientCountByOrg.get(p.organization_id) || 0) + 1)

  const ratingSumByOrg = new Map<string, { sum: number; count: number }>()
  for (const r of (reviews || []) as any[]) {
    const cur = ratingSumByOrg.get(r.organization_id) || { sum: 0, count: 0 }
    cur.sum += r.rating
    cur.count += 1
    ratingSumByOrg.set(r.organization_id, cur)
  }

  const organizations = orgs.map((o) => {
    const rating = ratingSumByOrg.get(o.id)
    return {
      slug: o.slug,
      name: o.name,
      pitch: o.pitch,
      clientCount: clientCountByOrg.get(o.id) || 0,
      avgRating: rating ? Math.round((rating.sum / rating.count) * 10) / 10 : null,
      reviewCount: rating?.count || 0,
    }
  })

  return NextResponse.json({ organizations })
}
