import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'

// Same plain yes/no as renter-status, keyed off a specific job instead of
// a tenancy — the contractor bid-polish button uses this to decide
// whether to show itself at all, before the contractor ever tries it.
//
// Scoped to "is the caller legitimately allowed to see this job at all" —
// a landlord sees their own job, a contractor sees an open-for-bidding job
// (the same thing the bid page itself already let them reach) or one they
// already bid on. An earlier version checked none of this and let any
// signed-in user probe an unrelated landlord's AI Assist billing status by
// guessing a job id — fixed per the strict "no user sees anything about
// another user" rule, even for a detail this minor.
export async function GET(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const role = user.app_metadata?.role

  const jobId = request.nextUrl.searchParams.get('jobId')
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('status, units(properties(owner_user_id))')
    .eq('id', jobId)
    .maybeSingle()
  const landlordUserId = (job as any)?.units?.properties?.owner_user_id
  if (!job || !landlordUserId) {
    return NextResponse.json({ available: false })
  }

  let allowed = role === 'landlord' && landlordUserId === user.id
  if (!allowed && role === 'contractor') {
    if (job.status === 'bidding') {
      allowed = true
    } else {
      const { data: bid } = await supabaseAdmin
        .from('bids')
        .select('id')
        .eq('job_id', jobId)
        .eq('contractor_user_id', user.id)
        .maybeSingle()
      allowed = !!bid
    }
  }
  if (!allowed) {
    return NextResponse.json({ available: false })
  }

  const available = await hasAiAssistAccess(supabaseAdmin, landlordUserId)
  return NextResponse.json({ available })
}
