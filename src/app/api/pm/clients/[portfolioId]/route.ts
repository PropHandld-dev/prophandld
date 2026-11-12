import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership } from '@/lib/pm'

export const maxDuration = 20

// Admin-only: set a client's approval threshold.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const membership = await getPmMembership(supabaseAdmin, user.id)
  if (!membership || membership.memberRole !== 'admin') {
    return NextResponse.json({ error: 'Only a PM organization admin can change a client’s threshold' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    approvalThreshold?: number
    managementFee?: number | null
    managementFeeFrequency?: 'one_time' | 'monthly' | null
    monthlySummaryEnabled?: boolean
    ownerReadOnly?: boolean
  }

  const update: Record<string, unknown> = {}
  if (body.approvalThreshold !== undefined) {
    if (typeof body.approvalThreshold !== 'number' || body.approvalThreshold < 0) {
      return NextResponse.json({ error: 'Invalid threshold' }, { status: 400 })
    }
    update.approval_threshold = body.approvalThreshold
  }
  if (body.managementFee !== undefined) {
    if (body.managementFee !== null && (typeof body.managementFee !== 'number' || body.managementFee < 0)) {
      return NextResponse.json({ error: 'Invalid management fee' }, { status: 400 })
    }
    update.management_fee = body.managementFee
    update.management_fee_frequency = body.managementFee === null ? null : body.managementFeeFrequency || 'monthly'
  }
  if (body.monthlySummaryEnabled !== undefined) {
    if (typeof body.monthlySummaryEnabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
    }
    update.monthly_summary_enabled = body.monthlySummaryEnabled
  }
  if (body.ownerReadOnly !== undefined) {
    if (typeof body.ownerReadOnly !== 'boolean') {
      return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
    }
    update.owner_read_only = body.ownerReadOnly
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: updated, error } = await supabaseAdmin
    .from('pm_client_portfolios')
    .update(update)
    .eq('id', portfolioId)
    .eq('organization_id', membership.organizationId)
    .select('id')

  if (error) {
    console.error('pm/clients/[portfolioId]: error updating threshold', error)
    return NextResponse.json({ error: 'Could not update threshold' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

// Owner declines/leaves, or an org ADMIN removes a client — not staff.
// Property data and history are untouched; this only removes the link.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const membership = await getPmMembership(supabaseAdmin, user.id)

  // Caught in testing: this used to branch on "is this caller in a PM org
  // at all," which let any accepted STAFF member remove a client
  // relationship, not just an admin — the UI's own Remove button was
  // already admin-gated, but the route itself wasn't, so a change there
  // (or a direct request) would have silently allowed it.
  let query = supabaseAdmin.from('pm_client_portfolios').delete().eq('id', portfolioId)
  if (membership?.memberRole === 'admin') {
    query = query.eq('organization_id', membership.organizationId)
  } else {
    query = query.eq('owner_user_id', user.id)
  }
  const { data: deleted, error } = await query.select('id')

  if (error) {
    console.error('pm/clients/[portfolioId]: error removing', error)
    return NextResponse.json({ error: 'Could not remove that client' }, { status: 500 })
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
