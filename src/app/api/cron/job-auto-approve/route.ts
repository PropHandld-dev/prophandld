import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { buildNotificationEmail, buildPushMessage, sendEmail, sendAutoApprovalDigestAdminEmail, sendJobAutoApprovedPayNowEmail, type NotifyJobInfo } from '@/lib/email'
import { sendPush } from '@/lib/push'

export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000
const AUTO_APPROVE_AFTER_MS = 3 * DAY_MS
const ID_CHUNK = 100
const CONCURRENCY = 10

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function runInBatches<T>(items: T[], task: (item: T) => Promise<void>) {
  for (const batch of chunk(items, CONCURRENCY)) {
    const results = await Promise.allSettled(batch.map(task))
    results.forEach((r) => {
      if (r.status === 'rejected') console.error('cron/job-auto-approve: task failed', r.reason)
    })
  }
}

// Runs daily (see vercel.json). The app has told landlords for weeks that a
// finished job "auto-approves within 3 days" if they don't respond, but
// nothing ever actually did that — it was only a note on an internal admin
// screen for a person to notice. This makes it real:
//
// 1. Any job still sitting in `pending_review` 3+ days after the contractor
//    marked it complete gets moved to `completed`, same as a landlord
//    clicking Approve themselves.
// 2. It does NOT pay the contractor. Paying requires Stripe to see the
//    landlord present in their browser (card entry or bank confirmation) —
//    there's no saved payment method to charge automatically today. So the
//    landlord is emailed to pay right away, the contractor and renter are
//    told the job is approved (the same notification a manual approval
//    sends), and one digest goes to the Prophandld inbox so a person can
//    follow up if a landlord still doesn't pay.
//
// Idempotent: the update only touches rows still in `pending_review`, so a
// job a landlord approves (or pays) at the same moment is left alone, and
// running this twice in a row does nothing the second time.
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const cutoff = new Date(Date.now() - AUTO_APPROVE_AFTER_MS).toISOString()

  // Paged rather than one query: Supabase silently caps a single response at
  // 1000 rows, and a page just past that limit would otherwise vanish with
  // no error — the same reason cron/rent-reminder pages its own read.
  const PAGE_SIZE = 500
  const staleJobs: any[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error: jobsError } = await supabaseAdmin
      .from('jobs')
      .select('id, category, is_emergency, unit_id, contractor_completed_at, units(unit_number, properties(address, city))')
      .eq('status', 'pending_review')
      .not('contractor_completed_at', 'is', null)
      .lte('contractor_completed_at', cutoff)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)

    if (jobsError) {
      console.error('cron/job-auto-approve: error fetching jobs', jobsError)
      return NextResponse.json({ error: 'Could not fetch jobs' }, { status: 500 })
    }
    staleJobs.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }

  if (staleJobs.length === 0) {
    return NextResponse.json({ ok: true, approved: 0 })
  }

  const jobIds = staleJobs.map((j) => j.id)
  const unitIds = Array.from(new Set(staleJobs.map((j) => j.unit_id).filter(Boolean)))

  const bidByJob = new Map<string, any>()
  for (const ids of chunk(jobIds, ID_CHUNK)) {
    const { data } = await supabaseAdmin
      .from('bids')
      .select('job_id, contractor_user_id, amount, payment_status')
      .in('job_id', ids)
      .eq('status', 'accepted')
    for (const b of data || []) bidByJob.set(b.job_id, b)
  }

  const tenancyByUnit = new Map<string, string>() // unit_id -> renter_user_id
  for (const ids of chunk(unitIds, ID_CHUNK)) {
    const { data } = await supabaseAdmin
      .from('tenancies')
      .select('unit_id, renter_user_id')
      .in('unit_id', ids)
      .eq('ended', false)
    for (const t of data || []) if (!tenancyByUnit.has(t.unit_id)) tenancyByUnit.set(t.unit_id, t.renter_user_id)
  }

  const property = (j: any) => (j.units as any)?.properties

  // The first query above deliberately doesn't select owner_user_id (kept the
  // select narrow); fetch it here instead of reshaping that query. Chunked
  // like the other lookups below, for the same reason.
  const ownerByJob = new Map<string, string>()
  for (const ids of chunk(jobIds, ID_CHUNK)) {
    const { data: jobsWithOwner } = await supabaseAdmin
      .from('jobs')
      .select('id, units(property_id, properties(owner_user_id))')
      .in('id', ids)
    for (const j of jobsWithOwner || []) {
      const owner = (j.units as any)?.properties?.owner_user_id
      if (owner) ownerByJob.set(j.id, owner)
    }
  }

  const userIds = new Set<string>()
  for (const j of staleJobs) {
    const bid = bidByJob.get(j.id)
    if (bid?.contractor_user_id) userIds.add(bid.contractor_user_id)
    const renterId = tenancyByUnit.get(j.unit_id)
    if (renterId) userIds.add(renterId)
    const ownerId = ownerByJob.get(j.id)
    if (ownerId) userIds.add(ownerId)
  }
  const userById = new Map<string, { email: string | null; full_name: string | null }>()
  for (const ids of chunk(Array.from(userIds), ID_CHUNK)) {
    const { data } = await supabaseAdmin.from('users').select('id, email, full_name').in('id', ids)
    for (const u of data || []) userById.set(u.id, u)
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'
  const digestEntries: { category: string; propertyLabel: string; contractorName: string; amount: number; jobId: string }[] = []
  let approved = 0

  await runInBatches(staleJobs, async (job) => {
    const bid = bidByJob.get(job.id)
    if (!bid) return // no accepted bid on this job — nothing to approve into

    // Only flip jobs still actually waiting for review. If a landlord (or an
    // earlier run) already moved it on, this update touches 0 rows and the
    // job is skipped rather than double-notified.
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('jobs')
      .update({ status: 'completed', landlord_approved_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'pending_review')
      .select('id')

    if (updateError) {
      console.error('cron/job-auto-approve: could not update job', { jobId: job.id, updateError })
      return
    }
    if (!updated || updated.length === 0) return
    approved++

    const propRow = property(job)
    const info: NotifyJobInfo = {
      jobId: job.id,
      category: job.category,
      address: propRow?.address ?? null,
      city: propRow?.city ?? null,
      isEmergency: job.is_emergency ?? false,
      // Guaranteed true at this exact moment: paying requires the job to
      // already be 'completed', which it wasn't until the update just above.
      paymentStatus: 'unpaid',
    }

    const contractor = bid.contractor_user_id ? userById.get(bid.contractor_user_id) : null
    const renterId = tenancyByUnit.get(job.unit_id)
    const renter = renterId ? userById.get(renterId) : null
    const landlordId = ownerByJob.get(job.id)
    const landlord = landlordId ? userById.get(landlordId) : null
    const amount = Number(bid.amount ?? 0)
    const propertyLabel = propRow?.address || 'the property'

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
      }).catch((err) => console.error('cron/job-auto-approve: landlord email failed', { jobId: job.id, err }))
    }
    if (landlordId) {
      await sendPush(landlordId, {
        title: 'Action needed: pay your contractor',
        body: `$${amount.toFixed(2)} for ${job.category} — approved automatically after 3 days`,
        url: `${siteUrl}/landlord/jobs/${job.id}`,
      }).catch((err) => console.error('cron/job-auto-approve: landlord push failed', { jobId: job.id, err }))
    }

    // Same notification a manual approval already sends to these two.
    if (contractor?.email) {
      const { subject, html } = buildNotificationEmail('job_completed', 'contractor', info)
      await sendEmail({ to: contractor.email, subject, html }).catch((err) =>
        console.error('cron/job-auto-approve: contractor email failed', { jobId: job.id, err })
      )
    }
    if (bid.contractor_user_id) {
      await sendPush(bid.contractor_user_id, buildPushMessage('job_completed', 'contractor', info)).catch((err) =>
        console.error('cron/job-auto-approve: contractor push failed', { jobId: job.id, err })
      )
    }
    if (renter?.email) {
      const { subject, html } = buildNotificationEmail('job_completed', 'renter', info)
      await sendEmail({ to: renter.email, subject, html }).catch((err) =>
        console.error('cron/job-auto-approve: renter email failed', { jobId: job.id, err })
      )
    }
    if (renterId) {
      await sendPush(renterId, buildPushMessage('job_completed', 'renter', info)).catch((err) =>
        console.error('cron/job-auto-approve: renter push failed', { jobId: job.id, err })
      )
    }

    digestEntries.push({
      category: job.category,
      propertyLabel,
      contractorName: contractor?.full_name || 'the contractor',
      amount,
      jobId: job.id,
    })
  })

  await sendAutoApprovalDigestAdminEmail({ jobs: digestEntries }).catch((err) =>
    console.error('cron/job-auto-approve: admin digest failed', err)
  )

  return NextResponse.json({ ok: true, approved, checked: staleJobs.length })
}
