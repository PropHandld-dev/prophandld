import zipcodes from 'zipcodes'
import { buildNotificationEmail, buildPushMessage, buildSmsMessage, sendEmail, type NotifyJobInfo } from '@/lib/email'
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
    .select('id, email, phone, sms_opt_in, service_categories, service_zip, service_radius_miles')
    .not('service_zip', 'is', null)

  if (error) {
    console.error('openJobAlerts: could not load contractors', error)
    return { sent: 0, reason: 'could not load contractors' }
  }

  const matches = (contractors || [])
    .filter((c: any) => c.id !== excludeUserId && c.email && (c.service_categories || []).includes(job.category))
    .map((c: any) => ({ c, miles: zipcodes.distance(String(c.service_zip).slice(0, 5), propertyZip) as number | null }))
    .filter(({ c, miles }: any) => miles !== null && miles !== undefined && miles <= (c.service_radius_miles || 25))
    .sort((a: any, b: any) => a.miles - b.miles)
    .slice(0, MAX_ALERTS_PER_JOB)

  const info: NotifyJobInfo = {
    jobId: job.id,
    category: job.category,
    address: property?.address ?? null,
    city: property?.city ?? null,
    isEmergency: job.is_emergency ?? false,
  }

  await Promise.allSettled(
    matches.map(async ({ c }: any) => {
      const { subject, html } = buildNotificationEmail('job_open', 'contractor', info)
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
