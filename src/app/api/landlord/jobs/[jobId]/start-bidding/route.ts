import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasValidDefaultPaymentMethod } from '@/lib/defaultPaymentMethod'
import { expectRow } from '@/lib/expectRow'
import { getActionableOwnerIdsAdmin } from '@/lib/pm'

export const maxDuration = 15

// The one real gate for this whole feature: a job can't open for bidding
// unless its landlord has a card on file (see DefaultPaymentMethodCard /
// cron/unpaid-job-reminder's autocharge step). Replaces three previously
// direct, ungated client-side Supabase updates (landlord/jobs/page.tsx,
// landlord/jobs/[jobId]/page.tsx x2) with one server-side check that
// can't be bypassed by calling Supabase directly instead of the UI.
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()

  const { data: job, error: jobError } = await admin
    .from('jobs')
    .select('id, status, units(properties(owner_user_id))')
    .eq('id', jobId)
    .maybeSingle()

  if (jobError) {
    console.error('start-bidding: error fetching job', jobError)
    return NextResponse.json({ error: 'Could not load job' }, { status: 500 })
  }

  const landlordUserId = (job?.units as any)?.properties?.owner_user_id
  // Was literal-owner-only -- same fix as complete-diy right next to
  // this in the jobs domain. hasValidDefaultPaymentMethod below already
  // correctly checks landlordUserId (the real owner), not the caller, so
  // this gate was the only thing actually blocking a co-owner/PM staff
  // member from opening a client's job for bidding at all.
  if (!job || !landlordUserId || !(await getActionableOwnerIdsAdmin(admin, user.id)).includes(landlordUserId)) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (!['approved', 'bidding'].includes(job.status)) {
    return NextResponse.json({ error: 'This job is not ready to open for bidding.' }, { status: 400 })
  }
  // Already bidding (e.g. a double-click) — nothing to do, not an error.
  if (job.status === 'bidding') {
    return NextResponse.json({ ok: true })
  }

  if (!(await hasValidDefaultPaymentMethod(admin, landlordUserId))) {
    return NextResponse.json({ error: 'needs_payment_method' }, { status: 400 })
  }

  const { error: updateError } = await expectRow(
    admin.from('jobs').update({ status: 'bidding', bidding_opened_at: new Date().toISOString() }).eq('id', jobId).eq('status', 'approved')
  )

  if (updateError) {
    console.error('start-bidding: could not open bidding', { jobId, updateError })
    return NextResponse.json({ error: 'Could not open this job for bidding.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
