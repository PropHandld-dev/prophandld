import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'

export const maxDuration = 20

// Admin visibility into the PM feature as a whole: every org that
// exists, not just the ones opted into a public profile (an org still
// manages real clients' properties and real money even if it never
// turns on discoverability). Built the same day the public-facing
// profiles/reviews shipped -- a page with real public user-generated
// content needs an admin moderation path from day one, not added later
// once something actually goes wrong.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const admin = getSupabaseAdmin()

  const { data: orgs } = await admin
    .from('pm_organizations')
    .select('id, name, slug, open_to_clients, pitch, created_at, admin:admin_user_id(full_name, email)')
    .order('created_at', { ascending: false })

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ organizations: [] })
  }

  const orgIds = orgs.map((o) => o.id)

  const [{ data: portfolios }, { data: members }, { data: reviews }] = await Promise.all([
    admin.from('pm_client_portfolios').select('organization_id, status').in('organization_id', orgIds),
    admin.from('pm_organization_members').select('organization_id, status').in('organization_id', orgIds),
    admin
      .from('pm_reviews')
      .select('id, organization_id, rating, comment, created_at, reviewer:reviewer_user_id(full_name, email)')
      .in('organization_id', orgIds)
      .order('created_at', { ascending: false }),
  ])

  const clientCounts = new Map<string, { accepted: number; pending: number }>()
  for (const p of (portfolios || []) as any[]) {
    const cur = clientCounts.get(p.organization_id) || { accepted: 0, pending: 0 }
    if (p.status === 'accepted') cur.accepted++
    else cur.pending++
    clientCounts.set(p.organization_id, cur)
  }

  const staffCounts = new Map<string, number>()
  for (const m of (members || []) as any[]) {
    if (m.status !== 'accepted') continue
    staffCounts.set(m.organization_id, (staffCounts.get(m.organization_id) || 0) + 1)
  }

  const reviewsByOrg = new Map<string, any[]>()
  for (const r of (reviews || []) as any[]) {
    const list = reviewsByOrg.get(r.organization_id) || []
    list.push({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.created_at,
      reviewerName: r.reviewer?.full_name || 'Unknown',
      reviewerEmail: r.reviewer?.email || null,
    })
    reviewsByOrg.set(r.organization_id, list)
  }

  const organizations = orgs.map((o: any) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    openToClients: !!o.open_to_clients,
    pitch: o.pitch,
    createdAt: o.created_at,
    adminName: o.admin?.full_name || 'Unknown',
    adminEmail: o.admin?.email || null,
    acceptedClients: clientCounts.get(o.id)?.accepted || 0,
    pendingClients: clientCounts.get(o.id)?.pending || 0,
    staffCount: staffCounts.get(o.id) || 0,
    reviews: reviewsByOrg.get(o.id) || [],
  }))

  return NextResponse.json({ organizations })
}
