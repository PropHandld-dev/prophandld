import zipcodes from 'zipcodes'
import { buildNotificationEmail, buildPushMessage, buildSmsMessage, sendEmail, type NotifyJobInfo, type Lang } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { sendSms } from '@/lib/sms'

const MAX_ALERTS_PER_JOB = 30

/**
 * Tells the contractors who could actually take a job that it just opened for
 * bidding: their trade includes the job's category and the property is inside
 * their travel radius (same rule as their "available jobs" list). Nobody is
 * told while a job is still waiting for the landlord to acknowledge it.
 */
export async function notifyMatchingContractors(admin: any, jobId: string, excludeUserId?: string) {
  const { data: job } = await admin
    .from('jobs')
    .select('id, category, status, is_emergency, units(properties(address, city, zip))')
    .eq('id', jobId)
    .maybeSingle()

  if (!job || job.status !== 'bidding') return { sent: 0, reason: 'job is not open for bidding' }

  const property = (job.units as any)?.properties
  const propertyZip: string | null = property?.zip ? String(property.zip).slice(0, 5) : null
  if (!propertyZip) return { sent: 0, reason: 'property has no ZIP code' }

  const { data: contractors, error } = await admin
    .from('users')
    .select('id, email, phone, sms_opt_in, service_categories, service_zip, service_radius_miles, preferred_language, notify_all_categories')
    .not('service_zip', 'is', null)

  if (error) {
    console.error('openJobAlerts: could not load contractors', error)
    return { sent: 0, reason: 'could not load contractors' }
  }

  // A brand-new or one-off category (someone reports "Other: theft") starts
  // with zero contractors who've ever selected it, so a strict category
  // match would alert nobody at all — exactly the gap that came up in
  // testing. notify_all_categories (default true, see the SQL) lets a
  // contractor opt into every nearby job regardless of category instead of
  // only their selected trades; opting out narrows them back to an exact
  // category match, same as before.
  const candidates = (contractors || [])
    .filter(
      (c: any) =>
        c.id !== excludeUserId &&
        c.email &&
        (c.notify_all_categories !== false || (c.service_categories || []).includes(job.category))
    )
    .map((c: any) => ({ c, miles: zipcodes.distance(String(c.service_zip).slice(0, 5), propertyZip) as number | null }))
    .filter(({ c, miles }: any) => miles !== null && miles !== undefined && miles <= (c.service_radius_miles || 25))
    .sort((a: any, b: any) => a.miles - b.miles)
    .slice(0, MAX_ALERTS_PER_JOB)

  // `public.users` has no role column — role only ever lives in Supabase
  // Auth's user_metadata — so everything above can only match on leftover
  // service_zip/service_categories values, regardless of who currently
  // holds them. That's how a landlord who once set up a contractor
  // profile (or switched roles) could still get matched here and receive
  // a "New Electrical job near you" email that made no sense for their
  // current account. Bounded to at most MAX_ALERTS_PER_JOB lookups since
  // this runs after the zip/radius/category filtering already narrowed
  // the list down, not against the whole user base.
  const roleChecks = await Promise.all(
    candidates.map(({ c }: any) => admin.auth.admin.getUserById(c.id).catch(() => null))
  )
  const matches = candidates.filter((_: any, i: number) => roleChecks[i]?.data?.user?.user_metadata?.role === 'contractor')

  const info: NotifyJobInfo = {
    jobId: job.id,
    category: job.category,
    address: property?.address ?? null,
    city: property?.city ?? null,
    isEmergency: job.is_emergency ?? false,
  }

  await Promise.allSettled(
    matches.map(async ({ c }: any) => {
      const lang: Lang = c.preferred_language === 'es' ? 'es' : 'en'
      const { subject, html } = buildNotificationEmail('job_open', 'contractor', info, lang)
      await sendEmail({ to: c.email, subject, html })
      await sendPush(c.id, buildPushMessage('job_open', 'contractor', info)).catch((err) =>
        console.error('openJobAlerts: push failed', { userId: c.id, err })
      )
      // Text messages cost money, so only genuine emergencies, and only for opted-in contractors.
      if (info.isEmergency && c.sms_opt_in && c.phone) {
        await sendSms(c.phone, buildSmsMessage('job_open', info)).catch((err) =>
          console.error('openJobAlerts: sms failed', { userId: c.id, err })
        )
      }
    })
  )

  return { sent: matches.length }
}
