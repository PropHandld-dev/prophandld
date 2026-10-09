import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendReviewReceivedEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'

// Tells the contractor they got a new review. Called fire-and-forget after
// ReviewForm's client-side insert into contractor_reviews succeeds, same
// pattern as contractor/credential-submitted — a failure here never blocks
// the reviewer. Only fires on a review's first submission (ReviewForm
// skips the call on an edit), so rating an already-reviewed job again
// never re-notifies.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const role = user.app_metadata?.role
  if (role !== 'landlord' && role !== 'renter') {
    return NextResponse.json({ error: 'Only landlords and renters leave reviews' }, { status: 403 })
  }

  const { jobId, contractorUserId, averageRating } = (await request.json()) as {
    jobId?: string
    contractorUserId?: string
    averageRating?: number
  }
  if (!jobId || !contractorUserId || !averageRating) {
    return NextResponse.json({ error: 'Missing review details' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Only someone actually on this job (landlord, or the active renter) can
  // trigger a notification about it — same authorization shape as /api/notify.
  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('category, unit_id, units(property_id, properties(address, owner_user_id))')
    .eq('id', jobId)
    .maybeSingle()
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  const property = (job.units as any)?.properties
  let allowed = role === 'landlord' && property?.owner_user_id === user.id
  if (!allowed && role === 'renter') {
    const { data: tenancy } = await supabaseAdmin
      .from('tenancies')
      .select('id')
      .eq('unit_id', job.unit_id)
      .eq('renter_user_id', user.id)
      .maybeSingle()
    allowed = !!tenancy
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const { data: contractor } = await supabaseAdmin
    .from('users')
    .select('email, full_name, preferred_language, email_notifications_enabled')
    .eq('id', contractorUserId)
    .maybeSingle()

  if (contractor?.email && emailAllowed(contractor)) {
    await sendReviewReceivedEmail({
      to: contractor.email,
      contractorName: contractor.full_name || 'there',
      reviewerRole: role,
      averageRating,
      category: job.category || 'your job',
      propertyLabel: property?.address || 'the property',
      lang: contractor.preferred_language === 'es' ? 'es' : 'en',
    }).catch((err) => console.error('review-submitted: email failed', err))
  }

  await sendPush(contractorUserId, {
    title: 'You got a new review',
    body: `${'★'.repeat(Math.round(averageRating))}${'☆'.repeat(5 - Math.round(averageRating))} for ${job.category || 'your job'}`,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/contractor/settings`,
  }).catch((err) => console.error('review-submitted: sendPush failed', err))

  return NextResponse.json({ ok: true })
}
