import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { logAdminAudit } from '@/lib/auditLog'

export const maxDuration = 15

// Removes one review -- the only moderation lever that exists for this
// public user-generated content. A removed review's reviewer can leave
// a new one later (the upsert constraint is per org+reviewer, not a
// one-time thing), which is the right call: this is for taking down a
// specific bad review, not permanently silencing a real client.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const admin = getSupabaseAdmin()
  const { data: review, error } = await admin
    .from('pm_reviews')
    .delete()
    .eq('id', reviewId)
    .select('organization_id, reviewer_user_id')
    .maybeSingle()

  if (error || !review) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 })
  }

  await logAdminAudit({
    actionType: 'pm_review_removed',
    actorUserId: user.id,
    actorEmail: user.email,
    targetUserId: review.reviewer_user_id,
    targetRole: 'landlord',
    detail: { reviewId, organizationId: review.organization_id },
  })

  return NextResponse.json({ ok: true })
}
