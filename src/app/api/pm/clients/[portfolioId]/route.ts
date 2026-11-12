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

  const { approvalThreshold } = (await request.json().catch(() => ({}))) as { approvalThreshold?: number }
  if (typeof approvalThreshold !== 'number' || approvalThreshold < 0) {
    return NextResponse.json({ error: 'Invalid threshold' }, { status: 400 })
  }

  const { data: updated, error } = await supabaseAdmin
    .from('pm_client_portfolios')
    .update({ approval_threshold: approvalThreshold })
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
