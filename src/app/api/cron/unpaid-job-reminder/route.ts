import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendUnpaidJobReminderEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'
import { notifyLandlordIds } from '@/lib/landlordCoOwners'

export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000
// Gives the approval-time email (manual approval's own notification, or
// job-auto-approve's "pay now" email) a full day to work before nagging
// again, then once more every ~20h after that (comfortably under the
// cron's own 24h cadence, so a daily run never skips a day).
const FIRST_REMINDER_AFTER_MS = DAY_MS
const REMIND_AGAIN_AFTER_MS = 20 * 60 * 60 * 1000
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
      if (r.status === 'rejected') console.error('cron/unpaid-job-reminder: task failed', r.reason)
    })
  }
}

// PAY-10: approval and payment release are two separate steps in this app —
// approving a job (manually, or via cron/job-auto-approve after 3 days)
// never itself charges Stripe; that only happens if the landlord follows
// through and picks a payment method. Nothing used to check back on a job
// that got approved and then just... sat there unpaid. This runs daily and
// resends a "pay your contractor" reminder to any landlord with a
// completed-but-unpaid job, repeating until it's actually paid.
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const now = Date.now()
  const approvedCutoff = new Date(now - FIRST_REMINDER_AFTER_MS).toISOString()

  const PAGE_SIZE = 500
  const candidateJobs: any[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error: jobsError } = await supabaseAdmin
      .from('jobs')
      .select('id, category, landlord_approved_at, unpaid_reminder_last_sent_at, units(properties(address, city, owner_user_id))')
      .eq('status', 'completed')
      .not('landlord_approved_at', 'is', null)
      .lte('landlord_approved_at', approvedCutoff)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)

    if (jobsError) {
      console.error('cron/unpaid-job-reminder: error fetching jobs', jobsError)
      return NextResponse.json({ error: 'Could not fetch jobs' }, { status: 500 })
    }
    candidateJobs.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }

  // Only jobs due for a reminder right now: never reminded yet, or the last
  // reminder was far enough back that today's cron run is the next tick.
  const dueJobs = candidateJobs.filter((j) => {
    if (!j.unpaid_reminder_last_sent_at) return true
    return now - new Date(j.unpaid_reminder_last_sent_at).getTime() >= REMIND_AGAIN_AFTER_MS
  })

  if (dueJobs.length === 0) {
    return NextResponse.json({ ok: true, reminded: 0, checked: candidateJobs.length })
  }

  const jobIds = dueJobs.map((j) => j.id)

  const bidByJob = new Map<string, any>()
  for (const ids of chunk(jobIds, ID_CHUNK)) {
    const { data } = await supabaseAdmin
      .from('bids')
      .select('job_id, contractor_user_id, amount, payment_status')
      .in('job_id', ids)
      .eq('status', 'accepted')
    for (const b of data || []) bidByJob.set(b.job_id, b)
  }

  // Skip anything already paid — this cron only exists to chase the unpaid
  // case, and a paid job simply has nothing to remind anyone about.
  const unpaidJobs = dueJobs.filter((j) => {
    const bid = bidByJob.get(j.id)
    return bid && bid.payment_status !== 'paid'
  })

  if (unpaidJobs.length === 0) {
    return NextResponse.json({ ok: true, reminded: 0, checked: candidateJobs.length })
  }

  const property = (j: any) => (j.units as any)?.properties

  const ownerByJob = new Map<string, string>()
  for (const j of unpaidJobs) {
    const owner = property(j)?.owner_user_id
    if (owner) ownerByJob.set(j.id, owner)
  }

  const landlordRecipientsByPrimary = new Map<string, string[]>()
  await Promise.all(
    Array.from(new Set(Array.from(ownerByJob.values()))).map(async (ownerId) => {
      landlordRecipientsByPrimary.set(ownerId, await notifyLandlordIds(supabaseAdmin, ownerId))
    })
  )

  const userIds = new Set<string>()
  for (const j of unpaidJobs) {
    const bid = bidByJob.get(j.id)
    if (bid?.contractor_user_id) userIds.add(bid.contractor_user_id)
    const ownerId = ownerByJob.get(j.id)
    if (ownerId) {
      for (const id of landlordRecipientsByPrimary.get(ownerId) || [ownerId]) userIds.add(id)
    }
  }
  const userById = new Map<string, { email: string | null; full_name: string | null; preferred_language: string | null; email_notifications_enabled: boolean | null }>()
  for (const ids of chunk(Array.from(userIds), ID_CHUNK)) {
    const { data } = await supabaseAdmin.from('users').select('id, email, full_name, preferred_language, email_notifications_enabled').in('id', ids)
    for (const u of data || []) userById.set(u.id, u)
  }
  const langOf = (u: { preferred_language: string | null } | null | undefined) => (u?.preferred_language === 'es' ? 'es' : 'en')

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'
  let reminded = 0

  await runInBatches(unpaidJobs, async (job) => {
    // Claimed first, same reasoning as job-auto-approve's status update: if
    // two overlapping runs (or a run and a landlord paying mid-run) race on
    // this job, only one actually sends. A job the landlord paid between
    // the read above and now would still have payment_status 'paid' by the
    // time Stripe's webhook lands, but this guard also catches the rarer
    // case of another instance of this exact cron racing itself.
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('jobs')
      .update({ unpaid_reminder_last_sent_at: new Date().toISOString() })
      .eq('id', job.id)
      .or(`unpaid_reminder_last_sent_at.is.null,unpaid_reminder_last_sent_at.lt.${new Date(now - REMIND_AGAIN_AFTER_MS).toISOString()}`)
      .select('id')

    if (claimError) {
      console.error('cron/unpaid-job-reminder: could not claim job', { jobId: job.id, claimError })
      return
    }
    if (!claimed || claimed.length === 0) return

    const bid = bidByJob.get(job.id)
    const propRow = property(job)
    const contractor = bid?.contractor_user_id ? userById.get(bid.contractor_user_id) : null
    const landlordId = ownerByJob.get(job.id)
    const landlordRecipients = landlordId ? (landlordRecipientsByPrimary.get(landlordId) || [landlordId]) : []
    const amount = Number(bid?.amount ?? 0)
    const propertyLabel = propRow?.address || 'the property'

    for (const recipientId of landlordRecipients) {
      const landlord = userById.get(recipientId)
      if (landlord?.email && emailAllowed(landlord)) {
        await sendUnpaidJobReminderEmail({
          to: landlord.email,
          landlordName: landlord.full_name || 'there',
          contractorName: contractor?.full_name || 'your contractor',
          amount,
          category: job.category,
          propertyLabel,
          jobId: job.id,
          lang: langOf(landlord),
        }).catch((err) => console.error('cron/unpaid-job-reminder: landlord email failed', { jobId: job.id, err }))
      }
      await sendPush(recipientId, {
        title: 'Your contractor still hasn’t been paid',
        body: `$${amount.toFixed(2)} for ${job.category} is still waiting`,
        url: `${siteUrl}/landlord/jobs/${job.id}`,
      }).catch((err) => console.error('cron/unpaid-job-reminder: landlord push failed', { jobId: job.id, err }))
    }

    reminded++
  })

  return NextResponse.json({ ok: true, reminded, checked: candidateJobs.length })
}
