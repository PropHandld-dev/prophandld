import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership } from '@/lib/pm'

export const maxDuration = 20

// Fetch the caller's org (as admin or staff), or null if they aren't in
// one yet.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const membership = await getPmMembership(supabaseAdmin, user.id)
  return NextResponse.json({ membership })
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
