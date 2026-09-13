import { Resend } from 'resend'

const SITE_URL = 'https://prophandld.com'

let resendClient: Resend | null = null

function getResendClient() {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY)
  }
  return resendClient
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  try {
    const { error } = await getResendClient().emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Prophandld <onboarding@resend.dev>',
      to,
      subject,
      html,
    })
    if (error) {
      console.error('Resend error sending to', to, error)
    }
  } catch (err) {
    console.error('Failed to send email to', to, err)
  }
}

function baseTemplate(heading: string, bodyHtml: string, ctaLabel: string, ctaUrl: string) {
  return `
    <div style="background:#0C1A2E;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:480px;margin:0 auto;background:#0F2138;border-radius:16px;padding:32px;">
        <p style="color:#ffffff;font-weight:700;font-size:16px;margin:0 0 24px;">Prophandld</p>
        <h1 style="color:#ffffff;font-size:20px;margin:0 0 12px;">${heading}</h1>
        <div style="color:rgba(255,255,255,0.6);font-size:14px;line-height:1.6;margin:0 0 24px;">${bodyHtml}</div>
        <a href="${ctaUrl}" style="display:inline-block;background:#12A5A9;color:#ffffff;font-weight:600;font-size:14px;padding:12px 24px;border-radius:999px;text-decoration:none;">${ctaLabel}</a>
      </div>
    </div>
  `
}

export type NotifyType =
  | 'job_reported'
  | 'bid_received'
  | 'contractor_selected'
  | 'schedule_confirmed'
  | 'job_pending_review'
  | 'job_completed'

export interface NotifyJobInfo {
  jobId: string
  category: string
  address: string | null
  city: string | null
}

function jobLocation(info: NotifyJobInfo) {
  return [info.address, info.city].filter(Boolean).join(', ') || 'your property'
}

export function buildNotificationEmail(type: NotifyType, role: 'landlord' | 'renter' | 'contractor', info: NotifyJobInfo) {
  const ctaUrl = `${SITE_URL}/${role}/jobs/${info.jobId}`

  switch (type) {
    case 'job_reported':
      return {
        subject: `New issue reported: ${info.category}`,
        html: baseTemplate(
          'A new issue was reported',
          `A tenant reported a <strong>${info.category}</strong> issue at ${jobLocation(info)}. Take a look and acknowledge it.`,
          'View issue',
          ctaUrl
        ),
      }
    case 'bid_received':
      return {
        subject: `New bid on your ${info.category} job`,
        html: baseTemplate(
          'You received a new bid',
          `A contractor submitted a sealed bid on your <strong>${info.category}</strong> job at ${jobLocation(info)}.`,
          'Review bids',
          ctaUrl
        ),
      }
    case 'contractor_selected':
      return {
        subject: `You've been selected for a job`,
        html: baseTemplate(
          "You've been selected",
          `A landlord selected your bid for a <strong>${info.category}</strong> job at ${jobLocation(info)}. Next step: schedule a time.`,
          'View job',
          ctaUrl
        ),
      }
    case 'schedule_confirmed':
      return {
        subject: `Schedule confirmed: ${info.category}`,
        html: baseTemplate(
          'Schedule confirmed',
          `The schedule for the <strong>${info.category}</strong> job at ${jobLocation(info)} is confirmed.`,
          'View job',
          ctaUrl
        ),
      }
    case 'job_pending_review':
      return {
        subject: `Contractor marked a job complete`,
        html: baseTemplate(
          'Ready for your review',
          `The contractor marked the <strong>${info.category}</strong> job at ${jobLocation(info)} as complete. Review the before/after photos and approve, or ask for verification.`,
          'Review job',
          ctaUrl
        ),
      }
    case 'job_completed':
      return {
        subject: `Job closed: ${info.category}`,
        html: baseTemplate(
          'Job closed out',
          `The <strong>${info.category}</strong> job at ${jobLocation(info)} has been approved and closed.`,
          'View job',
          ctaUrl
        ),
      }
  }
}
