import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership } from '@/lib/pm'

export const maxDuration = 20

// Admin-only: toggle a staff member's financial visibility.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const membership = await getPmMembership(supabaseAdmin, user.id)
  if (!membership || membership.memberRole !== 'admin') {
    return NextResponse.json({ error: 'Only a PM organization admin can change staff access' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    canViewFinancials?: boolean
    scopeAllClients?: boolean
    notificationMode?: 'realtime' | 'digest'
    assignedOwnerIds?: string[]
  }

  const update: Record<string, unknown> = {}
  if (body.canViewFinancials !== undefined) {
    if (typeof body.canViewFinancials !== 'boolean') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    update.can_view_financials = body.canViewFinancials
  }
  if (body.scopeAllClients !== undefined) {
    if (typeof body.scopeAllClients !== 'boolean') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    update.scope_all_clients = body.scopeAllClients
  }
  if (body.notificationMode !== undefined) {
    if (body.notificationMode !== 'realtime' && body.notificationMode !== 'digest') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    update.notification_mode = body.notificationMode
  }

  if (Object.keys(update).length > 0) {
    const { data: updated, error } = await supabaseAdmin
      .from('pm_organization_members')
      .update(update)
      .eq('id', memberId)
      .eq('organization_id', membership.organizationId)
      .eq('member_role', 'staff')
      .select('id')

    if (error) {
      console.error('pm/staff/[memberId]: error updating', error)
      return NextResponse.json({ error: 'Could not update that team member' }, { status: 500 })
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
    }
  }

  // Replace-the-whole-set, not a diff -- the checkbox list this feeds is
  // small (one org's accepted clients), so there's no meaningful cost to
  // just clearing and re-inserting instead of computing an add/remove
  // delta.
  if (body.assignedOwnerIds !== undefined) {
    if (!Array.isArray(body.assignedOwnerIds)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const { data: memberRow } = await supabaseAdmin
      .from('pm_organization_members')
      .select('id')
      .eq('id', memberId)
      .eq('organization_id', membership.organizationId)
      .eq('member_role', 'staff')
      .maybeSingle()
    if (!memberRow) return NextResponse.json({ error: 'Team member not found' }, { status: 404 })

    await supabaseAdmin.from('pm_staff_client_access').delete().eq('member_id', memberId)
    if (body.assignedOwnerIds.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('pm_staff_client_access')
        .insert(body.assignedOwnerIds.map((ownerUserId) => ({ member_id: memberId, owner_user_id: ownerUserId })))
      if (insertError) {
        console.error('pm/staff/[memberId]: error setting client access', insertError)
        return NextResponse.json({ error: 'Could not update client access' }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ ok: true })
}

// Staff member leaves, or admin removes them.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const membership = await getPmMembership(supabaseAdmin, user.id)

  let query = supabaseAdmin.from('pm_organization_members').delete().eq('id', memberId)
  if (membership?.memberRole === 'admin') {
    query = query.eq('organization_id', membership.organizationId)
  } else {
    query = query.eq('user_id', user.id)
  }
  // .select() so a filter that matched zero rows (not this caller's own
  // membership, and not something they admin) is told apart from an
  // actual delete — without it this returned {ok:true} either way, which
  // would tell a caller "removed" when the row was in fact left
  // untouched. Unreachable through the current UI (the Remove button
  // only renders for an admin already), but the route itself shouldn't
  // misreport if it's ever hit directly.
  const { data: deleted, error } = await query.select('id')

  if (error) {
    console.error('pm/staff/[memberId]: error removing', error)
    return NextResponse.json({ error: 'Could not remove that team member' }, { status: 500 })
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
