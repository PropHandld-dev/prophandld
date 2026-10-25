import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendAppointmentReminderEmail, type Lang } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { formatWhen } from '@/lib/notifyExtras'
import { emailAllowed } from '@/lib/notificationPrefs'
import { notifyLandlordIds } from '@/lib/landlordCoOwners'
import { notifyRenterIds } from '@/lib/coRenters'

export const maxDuration = 60

const ID_CHUNK = 100
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const langOf = (u: { preferred_language?: string | null } | null | undefined): Lang =>
  u?.preferred_language === 'es' ? 'es' : 'en'

// Runs daily (see vercel.json). A confirmed appointment's date, not its
// exact time, is what this app actually has — proposed_window is a coarse
// morning/afternoon/evening bucket and proposed_time is optional — so
// "24 hours before" means "the day before", checked once a day, not an
// hour-precise countdown that data doesn't really support.
//
// Reminds all three people on the appointment, not just the tenant: the
// tenant gets one more chance to add or fix access notes before the visit,
// the contractor gets a heads-up so tomorrow's job isn't a surprise, and
// the landlord gets a passive FYI (never asked to do anything).
//
// appointment_reminder_sent_for records which confirmed date was last
// reminded for — compared against the row's actual proposed_date, not just
// "was a reminder ever sent", so a job that gets rescheduled after its
// first reminder correctly gets a fresh one for the new date instead of
// staying silently suppressed.
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

  const { data: jobsData, error: jobsError } = await admin
    .from('jobs')
    .select('id, category, unit_id, proposed_date, proposed_window, proposed_time, appointment_reminder_sent_for, units(unit_number, properties(address, city, owner_user_id))')
    .eq('schedule_confirmed', true)
    .eq('proposed_date', tomorrowKey)
    .not('status', 'in', '(completed,archived,declined)')

  if (jobsError) {
    console.error('cron/appointment-reminder: error fetching jobs', jobsError)
    return NextResponse.json({ error: 'Could not fetch jobs' }, { status: 500 })
  }

  // Already reminded for this exact date — a rerun of the same day's cron,
  // not a fresh appointment.
  const dueJobs = (jobsData || []).filter((j) => j.appointment_reminder_sent_for !== tomorrowKey)
  if (dueJobs.length === 0) {
    return NextResponse.json({ ok: true, remindersSent: 0 })
  }

  const jobIds = dueJobs.map((j) => j.id)
  const unitIds = Array.from(new Set(dueJobs.map((j) => j.unit_id).filter(Boolean)))

  const bidByJob = new Map<string, { contractor_user_id: string }>()
  for (const ids of chunk(jobIds, ID_CHUNK)) {
    const { data } = await admin.from('bids').select('job_id, contractor_user_id').in('job_id', ids).eq('status', 'accepted')
    for (const b of data || []) bidByJob.set(b.job_id, b)
  }

  const tenancyByUnit = new Map<string, string>() // unit_id -> renter_user_id
  const tenancyIdByUnit = new Map<string, string>() // unit_id -> tenancy id
  for (const ids of chunk(unitIds, ID_CHUNK)) {
    const { data } = await admin.from('tenancies').select('id, unit_id, renter_user_id').in('unit_id', ids).eq('ended', false)
    for (const t of data || []) {
      if (!tenancyByUnit.has(t.unit_id)) {
        tenancyByUnit.set(t.unit_id, t.renter_user_id)
        tenancyIdByUnit.set(t.unit_id, t.id)
      }
    }
  }

  // Reminds every co-owner and co-renter too, same full-access fan-out as
  // the central /api/notify dispatcher — previously only the single
  // property.owner_user_id and tenancy.renter_user_id ever got this.
  const landlordRecipientsByOwner = new Map<string, string[]>()
  const ownerIds = Array.from(new Set(dueJobs.map((j) => (j.units as any)?.properties?.owner_user_id).filter(Boolean)))
  await Promise.all(ownerIds.map(async (id) => landlordRecipientsByOwner.set(id, await notifyLandlordIds(admin, id))))

  const renterRecipientsByUnit = new Map<string, string[]>()
  await Promise.all(
    Array.from(tenancyByUnit.entries()).map(async ([unitId, renterId]) => {
      const tenancyId = tenancyIdByUnit.get(unitId)
      if (!tenancyId) return
      renterRecipientsByUnit.set(unitId, await notifyRenterIds(admin, tenancyId, renterId))
    })
  )

  const userIds = new Set<string>()
  for (const j of dueJobs) {
    const bid = bidByJob.get(j.id)
    if (bid?.contractor_user_id) userIds.add(bid.contractor_user_id)
    for (const id of renterRecipientsByUnit.get(j.unit_id) || []) userIds.add(id)
    const ownerId = (j.units as any)?.properties?.owner_user_id
    if (ownerId) for (const id of landlordRecipientsByOwner.get(ownerId) || [ownerId]) userIds.add(id)
  }
  const userById = new Map<string, { email: string | null; full_name: string | null; preferred_language: string | null; email_notifications_enabled: boolean | null }>()
  for (const ids of chunk(Array.from(userIds), ID_CHUNK)) {
    const { data } = await admin.from('users').select('id, email, full_name, preferred_language, email_notifications_enabled').in('id', ids)
    for (const u of data || []) userById.set(u.id, u)
  }

  let remindersSent = 0
  for (const job of dueJobs) {
    const property = (job.units as any)?.properties
    const unitLabel = (job.units as any)?.unit_number ? `Unit ${(job.units as any).unit_number}` : null
    const propertyLabel = property?.address || 'the property'
    const when = formatWhen(job.proposed_date, job.proposed_window, job.proposed_time) || job.proposed_date

    const bid = bidByJob.get(job.id)
    const isDiy = !bid
    const renterIds = renterRecipientsByUnit.get(job.unit_id) || []
    const landlordId = property?.owner_user_id
    const landlordIds = landlordId ? (landlordRecipientsByOwner.get(landlordId) || [landlordId]) : []

    const recipients: { userId: string | undefined; role: 'renter' | 'contractor' | 'landlord' }[] = [
      ...renterIds.map((userId) => ({ userId, role: 'renter' as const })),
      { userId: bid?.contractor_user_id, role: 'contractor' },
      ...landlordIds.map((userId) => ({ userId, role: 'landlord' as const })),
    ]

    // Access notes only matter to the contractor — they're the one about
    // to show up. Fetched once per job, not per recipient.
    let accessNotes: string | null = null
    if (bid?.contractor_user_id) {
      const { data: jobRow } = await admin.from('jobs').select('access_notes').eq('id', job.id).maybeSingle()
      accessNotes = jobRow?.access_notes ?? null
    }

    for (const { userId, role } of recipients) {
      if (!userId) continue
      const person = userById.get(userId)
      if (person?.email && emailAllowed(person)) {
        await sendAppointmentReminderEmail({
          to: person.email,
          role,
          name: person.full_name || 'there',
          category: job.category,
          propertyLabel,
          unitLabel,
          when,
          jobId: job.id,
          accessNotes: role === 'contractor' ? accessNotes : null,
          isDiy: role === 'landlord' ? isDiy : undefined,
          lang: langOf(person),
        }).catch((err) => console.error('cron/appointment-reminder: email failed', { jobId: job.id, role, err }))
      }
      await sendPush(userId, {
        title:
          role === 'landlord'
            ? isDiy
              ? `Tomorrow: ${job.category} (you're doing this one)`
              : `Tomorrow: ${job.category} (FYI)`
            : `Tomorrow: ${job.category}`,
        body: `${when} · ${propertyLabel}`,
        url: `${SITE_URL}/${role}/jobs/${job.id}`,
      }).catch((err) => console.error('cron/appointment-reminder: push failed', { jobId: job.id, role, err }))
    }

    await admin.from('jobs').update({ appointment_reminder_sent_for: tomorrowKey }).eq('id', job.id)
    remindersSent++
  }

  return NextResponse.json({ ok: true, remindersSent, checked: dueJobs.length })
}
