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

  const { error } = await supabaseAdmin
    .from('pm_client_portfolios')
    .update({ approval_threshold: approvalThreshold })
    .eq('id', portfolioId)
    .eq('organization_id', membership.organizationId)

  if (error) {
    console.error('pm/clients/[portfolioId]: error updating threshold', error)
    return NextResponse.json({ error: 'Could not update threshold' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// Owner declines/leaves, or admin removes a client — either side, any
// time. Property data and history are untouched; this only removes the
// link.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const membership = await getPmMembership(supabaseAdmin, user.id)

  let query = supabaseAdmin.from('pm_client_portfolios').delete().eq('id', portfolioId)
  if (membership) {
    query = query.eq('organization_id', membership.organizationId)
  } else {
    query = query.eq('owner_user_id', user.id)
  }
  const { error } = await query

  if (error) {
    console.error('pm/clients/[portfolioId]: error removing', error)
    return NextResponse.json({ error: 'Could not remove that client' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
