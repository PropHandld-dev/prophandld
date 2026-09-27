import type { SupabaseClient } from '@supabase/supabase-js'
import { buildNotificationEmail, buildPushMessage, sendEmail, sendJobAutoApprovedPayNowEmail, type NotifyJobInfo, type Lang } from '@/lib/email'
import { sendPush } from '@/lib/push'

const DAY_MS = 24 * 60 * 60 * 1000
const AUTO_APPROVE_AFTER_MS = 3 * DAY_MS
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'

const langOf = (u: { preferred_language?: string | null } | null | undefined): Lang =>
  u?.preferred_language === 'es' ? 'es' : 'en'

// Approves a single job that's genuinely been sitting in pending_review 3+
// days since the contractor marked it complete, and sends the same three
// notifications the daily cron (cron/job-auto-approve) sends for the exact
// same event: the landlord's "pay now" email (the one that actually matters
// — they're the only one who can release payment), plus the contractor's
// and renter's "your job was approved" notices.
//
// This exists because the landlord's and contractor's own job-detail pages
// each used to run a thinner copy of this logic themselves — a "don't make
// someone wait for tonight's cron to see accurate status" fallback for
// whoever happens to load the page first — but that copy only ever flipped
// the job's status and notified the renter/contractor, never the landlord.
// A landlord could have a job auto-approve out from under them (triggered
// by their own page load, or the contractor's) and never be told they now
// owe payment. Both pages now call this instead of writing to `jobs`
// directly, so there's exactly one place this rule and its notifications
// are implemented, not three drifting copies of it.
//
// Re-verifies the 3-day threshold itself from the job's own timestamp
// rather than trusting the caller, and only updates a row still actually
// in pending_review — idempotent against the nightly cron (or another
// concurrent call) reaching the same job first.
export async function autoApproveJobIfStale(admin: SupabaseClient, jobId: string): Promise<{ approved: boolean }> {
  const { data: job } = await admin
    .from('jobs')
    .select('id, category, is_emergency, unit_id, contractor_completed_at, status, units(properties(address, city, owner_user_id))')
    .eq('id', jobId)
    .maybeSingle()

  if (!job || job.status !== 'pending_review' || !job.contractor_completed_at) return { approved: false }
  if (Date.now() - new Date(job.contractor_completed_at).getTime() < AUTO_APPROVE_AFTER_MS) return { approved: false }

  const { data: updated, error: updateError } = await admin
    .from('jobs')
    .update({ status: 'completed', landlord_approved_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'pending_review')
    .select('id')

  if (updateError) {
    console.error('autoApproveJobIfStale: could not update job', { jobId, updateError })
    return { approved: false }
  }
  // 0 rows means someone else (the cron, or another concurrent call) already
  // moved it on — correct outcome, not an error, and nothing left to notify.
  if (!updated || updated.length === 0) return { approved: false }

  const property = (job.units as any)?.properties
  const [{ data: bid }, { data: tenancy }] = await Promise.all([
    admin.from('bids').select('contractor_user_id, amount').eq('job_id', jobId).eq('status', 'accepted').maybeSingle(),
    admin
      .from('tenancies')
      .select('renter_user_id')
      .eq('unit_id', job.unit_id)
      .eq('ended', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const info: NotifyJobInfo = {
    jobId: job.id,
    category: job.category,
    address: property?.address ?? null,
    city: property?.city ?? null,
    isEmergency: job.is_emergency ?? false,
    // Guaranteed true at this exact moment: paying requires the job to
    // already be 'completed', which it wasn't until the update just above.
    paymentStatus: 'unpaid',
  }

  const landlordId = property?.owner_user_id
  const amount = Number(bid?.amount ?? 0)
  const propertyLabel = property?.address || 'the property'

  const [{ data: landlord }, { data: contractor }, { data: renter }] = await Promise.all([
    landlordId
      ? admin.from('users').select('email, full_name, preferred_language').eq('id', landlordId).maybeSingle()
      : Promise.resolve({ data: null as any }),
    bid?.contractor_user_id
      ? admin.from('users').select('email, full_name, preferred_language').eq('id', bid.contractor_user_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    tenancy?.renter_user_id
      ? admin.from('users').select('email, preferred_language').eq('id', tenancy.renter_user_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
  ])

  // Tell the landlord specifically: this is the one that matters, since
  // they're the only person who can actually release payment.
  if (landlord?.email) {
    await sendJobAutoApprovedPayNowEmail({
      to: landlord.email,
      landlordName: landlord.full_name || 'there',
      contractorName: contractor?.full_name || 'your contractor',
      amount,
      category: job.category,
      propertyLabel,
      jobId: job.id,
      lang: langOf(landlord),
    }).catch((err) => console.error('autoApproveJobIfStale: landlord email failed', { jobId, err }))
  }
  if (landlordId) {
    await sendPush(landlordId, {
      title: 'Action needed: pay your contractor',
      body: `$${amount.toFixed(2)} for ${job.category}, approved automatically after 3 days`,
      url: `${SITE_URL}/landlord/jobs/${job.id}`,
    }).catch((err) => console.error('autoApproveJobIfStale: landlord push failed', { jobId, err }))
  }

  // Same notification a manual approval already sends to these two.
  if (contractor?.email) {
    const { subject, html } = buildNotificationEmail('job_completed', 'contractor', info, langOf(contractor))
    await sendEmail({ to: contractor.email, subject, html }).catch((err) =>
      console.error('autoApproveJobIfStale: contractor email failed', { jobId, err })
    )
  }
  if (bid?.contractor_user_id) {
    await sendPush(bid.contractor_user_id, buildPushMessage('job_completed', 'contractor', info)).catch((err) =>
      console.error('autoApproveJobIfStale: contractor push failed', { jobId, err })
    )
  }
  if (renter?.email) {
    const { subject, html } = buildNotificationEmail('job_completed', 'renter', info, langOf(renter))
    await sendEmail({ to: renter.email, subject, html }).catch((err) =>
      console.error('autoApproveJobIfStale: renter email failed', { jobId, err })
    )
  }
  if (tenancy?.renter_user_id) {
    await sendPush(tenancy.renter_user_id, buildPushMessage('job_completed', 'renter', info)).catch((err) =>
      console.error('autoApproveJobIfStale: renter push failed', { jobId, err })
    )
  }

  return { approved: true }
}
