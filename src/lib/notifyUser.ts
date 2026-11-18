import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'
import { sendPmNoticeEmail } from '@/lib/email'
import { sendAlertSms } from '@/lib/sms'

type Notice = {
  title: string
  body: string
  url: string
  email?: { subject: string; eyebrow: string; heading: string; body?: string; ctaLabel: string; facts?: { label: string; value: string }[] }
  // Money, approvals, access and security: email even when routine
  // notification emails are off, and text anyone who opted in to texts.
  critical?: boolean
  sms?: string
}

export async function notifyUser(admin: SupabaseClient, userId: string | null | undefined, notice: Notice): Promise<void> {
  if (!userId) return
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'
  const url = notice.url.startsWith('http') ? notice.url : `${site}${notice.url}`
  await sendPush(userId, { title: notice.title, body: notice.body, url }).catch((err) => console.error('notifyUser: push failed', err))
  if (!notice.email && !notice.sms) return
  const { data: user } = await admin
    .from('users')
    .select('email, phone, sms_opt_in, preferred_language, email_notifications_enabled')
    .eq('id', userId)
    .maybeSingle()
  if (notice.sms && user?.sms_opt_in && user.phone) {
    await sendAlertSms(user.phone, `Prophandld: ${notice.sms} ${url}`.slice(0, 300)).catch((err) => console.error('notifyUser: sms failed', err))
  }
  if (!notice.email || !user?.email || !(notice.critical || emailAllowed(user))) return
  await sendPmNoticeEmail({
    to: user.email,
    subject: notice.email.subject,
    eyebrow: notice.email.eyebrow,
    heading: notice.email.heading,
    body: notice.email.body || notice.body,
    ctaLabel: notice.email.ctaLabel,
    ctaUrl: url,
    facts: notice.email.facts,
    lang: user.preferred_language === 'es' ? 'es' : 'en',
  }).catch((err) => console.error('notifyUser: email failed', err))
}
