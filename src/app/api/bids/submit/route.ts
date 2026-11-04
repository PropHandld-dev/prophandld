import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 15

const MIN_BID_AMOUNT = 15

// Caught live by an external audit: a contractor whose job got cancelled
// and reopened for bidding tried to rebid, and the form's own direct
// client-side update (reusing their existing 'declined' bid row — see
// the comment this replaces) failed with a generic "Could not submit
// your bid. Please try again," most likely because the bids table's own
// UPDATE policy only allows a contractor to touch their own row while it
// was still 'pending', not after it had already moved to 'declined'. The
// admin client here does its own explicit authorization check instead of
// depending on that policy being permissive enough for this exact case.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'contractor') {
    return NextResponse.json({ error: 'Only contractors can submit a bid' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as {
    jobId?: string
    amount?: number
    pricing_type?: 'fixed' | 'hourly'
    labor_rate?: number | null
    availability?: string | null
    estimated_hours?: number | null
    notes?: string | null
    not_included?: string | null
  }
  const { jobId, amount } = body
  if (!jobId || !amount || amount < MIN_BID_AMOUNT) {
    return NextResponse.json({ error: 'Invalid bid' }, { status: 400 })
  }
  if (body.pricing_type === 'hourly' && (!body.estimated_hours || body.estimated_hours <= 0)) {
    return NextResponse.json({ error: 'Invalid estimated hours' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  const { data: job } = await admin.from('jobs').select('id, status').eq('id', jobId).maybeSingle()
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  if (job.status !== 'bidding') {
    return NextResponse.json({ error: 'This job is not open for bidding right now' }, { status: 409 })
  }

  const bidFields = {
    amount,
    pricing_type: body.pricing_type || 'fixed',
    labor_rate: body.pricing_type === 'hourly' && body.labor_rate ? body.labor_rate : null,
    availability: body.availability || null,
    estimated_hours: body.estimated_hours || null,
    notes: body.notes || null,
    not_included: body.not_included || null,
    status: 'pending' as const,
  }

  const { data: existingBid } = await admin
    .from('bids')
    .select('id')
    .eq('job_id', jobId)
    .eq('contractor_user_id', user.id)
    .maybeSingle()

  const { error: submitError } = existingBid
    ? await admin.from('bids').update({ ...bidFields, selected_at: null, price_change_status: null }).eq('id', existingBid.id)
    : await admin.from('bids').insert({ job_id: jobId, contractor_user_id: user.id, ...bidFields })

  if (submitError) {
    console.error('bids/submit: failed', submitError)
    return NextResponse.json({ error: 'Could not submit your bid. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
