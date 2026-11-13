import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership } from '@/lib/pm'
import { sendPush } from '@/lib/push'

export const maxDuration = 20

// Admin-side counterpart to /api/pm/clients/accept (the owner's own
// accept step) -- this one is for a request the OWNER started, where
// the PM admin is the one who needs to say yes. Authorization is the
// mirror image too: that route checks owner_user_id = caller, this one
// checks organization_id belongs to the caller's org.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const membership = await getPmMembership(admin, user.id)
  if (!membership || membership.memberRole !== 'admin') {
    return NextResponse.json({ error: 'Only a PM organization admin can accept this' }, { status: 403 })
  }

  const { data: updated, error } = await admin
    .from('pm_client_portfolios')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', portfolioId)
    .eq('organization_id', membership.organizationId)
    .eq('requested_by', 'owner')
    .eq('status', 'pending')
    .select('owner_user_id')
    .maybeSingle()

  if (error) {
    // A landlord can send a pending request to more than one PM company
    // at once (nothing blocks that -- the unique "one accepted PM"
    // index only applies once status actually becomes 'accepted'), so
    // this UPDATE can genuinely fail that constraint if someone else
    // already accepted them first. Surfaced as its own message instead
    // of a generic 404, which would read as "this request doesn't
    // exist" when it actually does, just can't be honored anymore.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This owner is already managed by another company and cannot be accepted.' }, { status: 409 })
    }
    console.error('pm/clients/[id]/accept: update failed', error)
    return NextResponse.json({ error: 'Could not accept that request' }, { status: 500 })
  }
  if (!updated) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  await sendPush(updated.owner_user_id, {
    title: 'Request accepted',
    body: `${membership.organizationName} accepted your request and now manages your property.`,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord/pm`,
  }).catch((err) => console.error('pm/clients/[id]/accept: push failed', err))

  return NextResponse.json({ ok: true })
}
