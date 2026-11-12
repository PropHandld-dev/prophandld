import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership } from '@/lib/pm'

export const maxDuration = 20

// Fetch the caller's org (as an accepted admin or staff member), or null
// if they aren't in one yet. Separately surfaces a PENDING staff invite
// (if any) -- getPmMembership only ever matches status='accepted', so
// without this a genuine pending team invite was completely invisible:
// nothing in the UI ever read pm_organization_members' pending rows, so
// an invited teammate had no way to even see, let alone accept, their
// own invite. Caught in testing, not by a user report.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const membership = await getPmMembership(supabaseAdmin, user.id)

  let pendingStaffInvite: { id: string; orgName: string } | null = null
  if (!membership) {
    // No uniqueness constraint blocks more than one PENDING staff invite
    // (only an accepted one), so this takes the most recent rather than
    // assuming exactly one row -- .maybeSingle() would error on a second
    // pending invite instead of degrading gracefully.
    const { data: pending } = await supabaseAdmin
      .from('pm_organization_members')
      .select('id, pm_organizations(name)')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('invited_at', { ascending: false })
      .limit(1)
    if (pending?.[0]) {
      pendingStaffInvite = { id: pending[0].id, orgName: (pending[0].pm_organizations as any)?.name || 'A property manager' }
    }
  }

  return NextResponse.json({ membership, pendingStaffInvite })
}

// Creates a new PM organization with the caller as its one Admin. A
// landlord with properties of their own can still do this — same "own a
// portfolio AND separately manage others" case landlord_co_owners already
// allows.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlord accounts can create a property management org' }, { status: 403 })
  }

  const { name } = (await request.json().catch(() => ({}))) as { name?: string }
  const orgName = name?.trim()
  if (!orgName) {
    return NextResponse.json({ error: 'Give your company a name' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const existing = await getPmMembership(supabaseAdmin, user.id)
  if (existing) {
    return NextResponse.json({ error: 'You already belong to a property management organization' }, { status: 400 })
  }

  const { data: org, error: orgError } = await supabaseAdmin
    .from('pm_organizations')
    .insert({ name: orgName, admin_user_id: user.id })
    .select('id')
    .single()

  if (orgError || !org) {
    console.error('pm/organizations: error creating org', orgError)
    return NextResponse.json({ error: 'Could not create your organization' }, { status: 500 })
  }

  const { error: memberError } = await supabaseAdmin.from('pm_organization_members').insert({
    organization_id: org.id,
    user_id: user.id,
    member_role: 'admin',
    can_view_financials: true,
    status: 'accepted',
    accepted_at: new Date().toISOString(),
  })

  if (memberError) {
    console.error('pm/organizations: error adding admin member', memberError)
    return NextResponse.json({ error: 'Could not finish setting up your organization' }, { status: 500 })
  }

  return NextResponse.json({ organizationId: org.id })
}
