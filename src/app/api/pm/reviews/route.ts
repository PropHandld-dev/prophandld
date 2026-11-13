import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 15

// Only an accepted client of the org can review it -- checked here,
// never a direct client insert, same no-self-insert stance as every
// other PM table (pm_audit_log, pm_reviews has no authenticated
// INSERT/UPDATE policy at all). Upsert: a client revising their take
// later replaces the old one rather than stacking duplicates.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { slug, rating, comment } = (await request.json().catch(() => ({}))) as {
    slug?: string
    rating?: number
    comment?: string
  }
  if (!slug || typeof rating !== 'number' || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Invalid review' }, { status: 400 })
  }
  if (comment !== undefined && (typeof comment !== 'string' || comment.length > 1000)) {
    return NextResponse.json({ error: 'Comment is too long' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  const { data: org } = await admin.from('pm_organizations').select('id').eq('slug', slug).maybeSingle()
  if (!org) {
    return NextResponse.json({ error: 'That company was not found' }, { status: 404 })
  }
  const organizationId = org.id

  const { data: portfolio } = await admin
    .from('pm_client_portfolios')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('owner_user_id', user.id)
    .eq('status', 'accepted')
    .maybeSingle()

  if (!portfolio) {
    return NextResponse.json({ error: 'You can only review a company currently managing your property' }, { status: 403 })
  }

  const { error } = await admin.from('pm_reviews').upsert(
    {
      organization_id: organizationId,
      reviewer_user_id: user.id,
      rating: Math.round(rating),
      comment: comment?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,reviewer_user_id' }
  )

  if (error) {
    console.error('pm/reviews: upsert failed', error)
    return NextResponse.json({ error: 'Could not save your review' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
