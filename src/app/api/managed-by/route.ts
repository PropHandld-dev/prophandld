import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 10

// GET ?jobId= or ?tenancyId= : the property management company running
// that property, if any, so tenants and contractors know who they're
// dealing with. Visibility rides on the caller's own RLS access to the
// job or tenancy; the company name is already public in the PM directory.
export async function GET(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const jobId = request.nextUrl.searchParams.get('jobId')
  const tenancyId = request.nextUrl.searchParams.get('tenancyId')
  if (!jobId && !tenancyId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: visible } = jobId
    ? await authClient.from('jobs').select('id').eq('id', jobId).maybeSingle()
    : await authClient.from('tenancies').select('id').eq('id', tenancyId!).maybeSingle()
  if (!visible) return NextResponse.json({ managedBy: null })

  const admin = getSupabaseAdmin()
  const { data: row } = jobId
    ? await admin.from('jobs').select('units(properties(owner_user_id))').eq('id', jobId).maybeSingle()
    : await admin.from('tenancies').select('units(properties(owner_user_id))').eq('id', tenancyId!).maybeSingle()
  const ownerId = (row as any)?.units?.properties?.owner_user_id
  if (!ownerId) return NextResponse.json({ managedBy: null })

  const { data: portfolio } = await admin
    .from('pm_client_portfolios')
    .select('pm_organizations(name, slug, open_to_clients, logo_url)')
    .eq('owner_user_id', ownerId)
    .eq('status', 'accepted')
    .maybeSingle()
  const org = (portfolio as any)?.pm_organizations
  if (!org?.name) return NextResponse.json({ managedBy: null })
  return NextResponse.json({
    managedBy: { name: org.name, profileSlug: org.open_to_clients ? org.slug : null, logoUrl: org.logo_url || null },
  })
}
