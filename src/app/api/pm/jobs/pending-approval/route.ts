import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership, getOrgManagedOwnerIds, scopeOwnerIdsForMember } from '@/lib/pm'

export const maxDuration = 20

// Every completed-but-not-yet-approved job across EVERY client this org
// manages, in one list -- the whole point of bulk approval: without this,
// a PM reviewing 10 clients has to open each one separately to find out
// which jobs are even waiting on them.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const membership = await getPmMembership(admin, user.id)
  if (!membership) {
    return NextResponse.json({ error: 'Not a property management org member' }, { status: 403 })
  }

  const orgOwnerIds = await getOrgManagedOwnerIds(admin, membership.organizationId)
  const ownerIds = await scopeOwnerIdsForMember(admin, membership, orgOwnerIds)
  if (ownerIds.length === 0) {
    return NextResponse.json({ jobs: [] })
  }

  const { data: jobs, error } = await admin
    .from('jobs')
    .select('id, category, created_at, units!inner(unit_number, property_id, properties!inner(owner_user_id, address, users(full_name)))')
    .eq('status', 'completed')
    .is('landlord_approved_at', null)
    .in('units.properties.owner_user_id', ownerIds)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('pm/jobs/pending-approval: query failed', error)
    return NextResponse.json({ error: 'Could not load pending approvals' }, { status: 500 })
  }

  return NextResponse.json({
    jobs: (jobs || []).map((j: any) => ({
      id: j.id,
      category: j.category,
      createdAt: j.created_at,
      ownerUserId: j.units?.properties?.owner_user_id,
      ownerName: j.units?.properties?.users?.full_name || 'Client',
      address: `${j.units?.properties?.address || ''}${j.units?.unit_number ? `, Unit ${j.units.unit_number}` : ''}`,
    })),
  })
}
