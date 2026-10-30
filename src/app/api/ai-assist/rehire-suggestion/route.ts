import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'

// "You used Mike for plumbing last time, message him about this one?" —
// a plain filtered query over data that already exists (who's been paid
// for a completed job in this category before), not an LLM call. Surfaced
// the moment a job has no bids yet, same spot the generic email-invite box
// already lives, right next to it.
export async function GET(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ contractor: null })
  }

  const supabaseAdmin = getSupabaseAdmin()
  if (!(await hasAiAssistAccess(supabaseAdmin, user.id))) {
    return NextResponse.json({ contractor: null })
  }

  const jobId = request.nextUrl.searchParams.get('jobId')
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
  }

  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('category, unit_id, units(properties(owner_user_id))')
    .eq('id', jobId)
    .maybeSingle()
  const landlordUserId = (job as any)?.units?.properties?.owner_user_id
  if (!job || landlordUserId !== user.id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Every past paid job, on any of this landlord's units, in the same
  // category — the jobs(...) filter scopes it to this landlord without a
  // separate properties/units round trip first.
  const { data: pastBids } = await supabaseAdmin
    .from('bids')
    .select('contractor_user_id, paid_at, jobs!inner(category, id, units!inner(properties!inner(owner_user_id)))')
    .eq('payment_status', 'paid')
    .eq('jobs.category', job.category)
    .eq('jobs.units.properties.owner_user_id', user.id)
    .neq('jobs.id', jobId)
    .order('paid_at', { ascending: false })
    .limit(1)

  const pastBid = pastBids?.[0] as any
  if (!pastBid) {
    return NextResponse.json({ contractor: null })
  }

  const { data: contractor } = await supabaseAdmin.from('users').select('full_name').eq('id', pastBid.contractor_user_id).maybeSingle()
  if (!contractor?.full_name) {
    return NextResponse.json({ contractor: null })
  }

  return NextResponse.json({ contractor: { id: pastBid.contractor_user_id, name: contractor.full_name } })
}
