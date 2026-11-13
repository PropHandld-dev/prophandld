import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership, scopeOwnerIdsForMember } from '@/lib/pm'

export const maxDuration = 15

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const membership = await getPmMembership(supabaseAdmin, user.id)
  if (!membership) {
    return NextResponse.json({ error: 'Not a property management org member' }, { status: 403 })
  }

  const { data: rows } = await supabaseAdmin
    .from('pm_audit_log')
    .select('id, action, amount, created_at, owner_user_id, actor_user_id, owner:owner_user_id(full_name), actor:actor_user_id(full_name)')
    .eq('organization_id', membership.organizationId)
    .order('created_at', { ascending: false })
    .limit(20)

  // Scoped the same way every other PM-wide route is -- filtered
  // post-query (the 20-row cap above is a reasonable tradeoff here; a
  // heavily-scoped staffer may see fewer than 20 even when more exist,
  // acceptable for an activity feed, not for anything authorizing money).
  const scopedOwnerIds = new Set(await scopeOwnerIdsForMember(supabaseAdmin, membership, (rows || []).map((r: any) => r.owner_user_id)))
  const visibleRows = membership.memberRole === 'admin' || membership.scopeAllClients ? rows || [] : (rows || []).filter((r: any) => scopedOwnerIds.has(r.owner_user_id))

  const entries = visibleRows.map((r: any) => ({
    id: r.id,
    action: r.action,
    amount: membership.canViewFinancials ? (r.amount !== null ? Number(r.amount) : null) : null,
    createdAt: r.created_at,
    ownerName: r.owner?.full_name || 'A client',
    actorName: r.actor?.full_name || 'Someone',
  }))

  return NextResponse.json({ entries })
}
