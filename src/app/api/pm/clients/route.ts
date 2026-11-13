import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership, scopeOwnerIdsForMember } from '@/lib/pm'

export const maxDuration = 20

// PM admin/staff: every client portfolio in their org, pending and
// accepted, with the owner's name so the UI can show who's who. Owners
// themselves see this through /api/pm/invites-for-me instead (a
// different shape: "who manages me," not "who do I manage").
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

  const { data: portfolios } = await supabaseAdmin
    .from('pm_client_portfolios')
    .select('id, owner_user_id, invited_email, approval_threshold, management_fee, management_fee_frequency, monthly_summary_enabled, owner_read_only, status, requested_by, invited_at, accepted_at, users(full_name, email)')
    .eq('organization_id', membership.organizationId)
    .order('invited_at', { ascending: false })

  // Scoped staff member: only shown the clients an admin has assigned
  // them, same rule every other PM-wide route now applies. A pending
  // invite with no owner_user_id yet (invited by email, no account
  // match) has nothing to scope against, so it stays admin/unscoped-
  // staff only -- a scoped staffer can't be assigned someone who isn't
  // a real client yet.
  const allOwnerIds = (portfolios || []).map((p: any) => p.owner_user_id).filter(Boolean)
  const scopedOwnerIds = new Set(await scopeOwnerIdsForMember(supabaseAdmin, membership, allOwnerIds))
  const visiblePortfolios =
    membership.memberRole === 'admin' || membership.scopeAllClients
      ? portfolios || []
      : (portfolios || []).filter((p: any) => p.owner_user_id && scopedOwnerIds.has(p.owner_user_id))

  const clients = visiblePortfolios.map((p: any) => ({
    id: p.id,
    ownerUserId: p.owner_user_id,
    ownerName: p.users?.full_name || p.invited_email || p.users?.email || 'Unknown',
    approvalThreshold: Number(p.approval_threshold),
    managementFee: p.management_fee !== null ? Number(p.management_fee) : null,
    managementFeeFrequency: p.management_fee_frequency,
    monthlySummaryEnabled: !!p.monthly_summary_enabled,
    ownerReadOnly: !!p.owner_read_only,
    status: p.status,
    requestedBy: p.requested_by as 'pm' | 'owner',
    invitedAt: p.invited_at,
    acceptedAt: p.accepted_at,
  }))

  return NextResponse.json({ clients, membership })
}
