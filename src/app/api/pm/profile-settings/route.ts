import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership } from '@/lib/pm'
import { ensureOrgSlug } from '@/lib/pmSlug'

export const maxDuration = 15

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

  const { data: org } = await admin
    .from('pm_organizations')
    .select('slug, open_to_clients, pitch')
    .eq('id', membership.organizationId)
    .maybeSingle()

  return NextResponse.json({
    slug: org?.slug || null,
    openToClients: !!org?.open_to_clients,
    pitch: org?.pitch || '',
  })
}

// Admin-only: turn public discoverability on/off and set the one-line
// pitch shown on the directory and the org's own shareable profile page.
// Enabling it for the first time generates the slug that URL needs --
// deliberately not asked for at org-creation time, since most PM admins
// creating an org just want to invite their first client, not think
// about a public listing yet.
export async function PATCH(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const membership = await getPmMembership(admin, user.id)
  if (!membership || membership.memberRole !== 'admin') {
    return NextResponse.json({ error: 'Only a PM organization admin can change this' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as { openToClients?: boolean; pitch?: string }
  const update: Record<string, unknown> = {}

  if (body.openToClients !== undefined) {
    if (typeof body.openToClients !== 'boolean') {
      return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
    }
    update.open_to_clients = body.openToClients
  }
  if (body.pitch !== undefined) {
    if (typeof body.pitch !== 'string' || body.pitch.length > 280) {
      return NextResponse.json({ error: 'Pitch must be 280 characters or fewer' }, { status: 400 })
    }
    update.pitch = body.pitch.trim() || null
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await admin.from('pm_organizations').update(update).eq('id', membership.organizationId)
  if (error) {
    console.error('pm/profile-settings: update failed', error)
    return NextResponse.json({ error: 'Could not save that' }, { status: 500 })
  }

  let slug: string | null = null
  if (body.openToClients) {
    slug = await ensureOrgSlug(admin, membership.organizationId, membership.organizationName)
  }

  return NextResponse.json({ ok: true, slug })
}
