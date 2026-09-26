import { Resend } from 'resend'
import { isPreviewDeployment } from '@/lib/env'

const SITE_URL = 'https://www.prophandld.com'

let resendClient: Resend | null = null

function getResendClient() {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY)
  }
  return resendClient
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (isPreviewDeployment()) {
    console.log('[staging] email suppressed', { to, subject })
    return { ok: true, id: 'suppressed-on-preview', from: 'staging' }
  }
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Prophandld <onboarding@resend.dev>'
  try {
    const { data, error } = await getResendClient().emails.send({
      from: fromAddress,
      to,
      subject,
      html,
    })
    if (error) {
      console.error('Resend error sending to', to, 'from', fromAddress, error)
      return { ok: false, error, from: fromAddress }
    }
    return { ok: true, id: data?.id, from: fromAddress }
  } catch (err) {
    console.error('Failed to send email to', to, 'from', fromAddress, err)
    return { ok: false, error: err, from: fromAddress }
  }
}

// Transactional email shell. One status pill, one headline, the facts that
// matter (what, where, when, how much), a progress tracker for job updates,
// and a single obvious action. `preheader` is the line Gmail and iPhone show
// beside the subject: without it they read out the first words of the email
// body, which is how "Job closed out Prophandld Job closed Job closed out"
// ended up in people's notification shade.
type EmailFact = { label: string; value: string }

const TRACKER_STEPS = ['Reported', 'Bidding', 'Scheduled', 'In progress', 'Review', 'Paid']

function trackerHtml(stage: number) {
  const cells = TRACKER_STEPS.map((label, i) => {
    const done = i < stage
    const active = i === stage
    const bar = active ? '#2DD4D9' : done ? '#0A7B7E' : '#22374F'
    const color = active ? '#FFFFFF' : done ? '#7FD4D6' : '#5E7189'
    return `<td width="16%" valign="top" style="padding:0 2px;">
        <div style="height:4px;border-radius:4px;background:${bar};font-size:0;line-height:0;">&nbsp;</div>
        <div style="font-size:10px;line-height:1.3;margin-top:7px;color:${color};font-weight:${active ? 700 : 500};">${label}</div>
      </td>`
  }).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>${cells}</tr></table>`
}

function factsHtml(facts: EmailFact[]) {
  const rows = facts
    .map((f, i) => {
      const line = i > 0 ? 'border-top:1px solid #1E3450;' : ''
      return `<tr>
          <td valign="top" style="padding:10px 0;${line}color:#8496AC;font-size:12px;width:36%;">${escapeHtml(f.label)}</td>
          <td valign="top" align="right" style="padding:10px 0;${line}color:#FFFFFF;font-size:14px;font-weight:600;">${escapeHtml(f.value)}</td>
        </tr>`
    })
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#132A45;border-radius:14px;margin:0 0 26px;"><tr><td style="padding:4px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>`
}

function baseTemplate({
  eyebrow,
  heading,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  preheader,
  facts,
  stage,
  note,
  footerText = 'Sent because you have an active Prophandld account.',
}: {
  eyebrow: string
  heading: string
  bodyHtml: string
  ctaLabel: string
  ctaUrl: string
  preheader?: string
  facts?: EmailFact[]
  stage?: number
  note?: string
  footerText?: string
}) {
  const preview = preheader !== undefined ? escapeHtml(preheader) : heading.replace(/<[^>]+>/g, '')
  // Pad the hidden preview so mail apps don't pull the start of the body into it.
  const padding = '&zwnj;&nbsp;'.repeat(70)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <meta name="supported-color-schemes" content="dark light" />
    <style>
      @media (max-width: 520px) {
        .pad { padding: 28px 22px !important; }
        .outer { padding: 24px 12px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#0C1A2E;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preview}${padding}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0C1A2E;">
      <tr>
        <td align="center" class="outer" style="padding:40px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding:0 4px 20px;">
                <img src="${SITE_URL}/apple-touch-icon.png" width="28" height="28" alt="" style="vertical-align:middle;border-radius:8px;margin-right:9px;" />
                <span style="color:#ffffff;font-weight:700;font-size:15px;letter-spacing:-0.01em;vertical-align:middle;">Prophandld</span>
              </td>
            </tr>
            <tr>
              <td class="pad" style="background:#0F2138;border:1px solid #1B2F48;border-radius:22px;padding:34px 32px;">
                <span style="display:inline-block;background:#0F8C90;background:linear-gradient(90deg,#0A7B7E,#12A5A9);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding:5px 12px;border-radius:999px;margin-bottom:18px;">${eyebrow}</span>
                <div style="color:#ffffff;font-size:23px;font-weight:700;line-height:1.28;margin:0 0 12px;letter-spacing:-0.015em;">${heading}</div>
                <div style="color:#A9B7C8;font-size:15px;line-height:1.65;margin:0 0 24px;">${bodyHtml}</div>
                ${stage !== undefined ? trackerHtml(stage) : ''}
                ${facts && facts.length > 0 ? factsHtml(facts) : ''}
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" bgcolor="#0F8C90" style="border-radius:999px;background:linear-gradient(90deg,#0A7B7E,#12A5A9);">
                      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;color:#ffffff;font-weight:600;font-size:15px;padding:14px 30px;border-radius:999px;text-decoration:none;">${ctaLabel} →</a>
                    </td>
                  </tr>
                </table>
                ${note ? `<div style="color:#7C8EA5;font-size:12px;line-height:1.5;margin-top:14px;">${escapeHtml(note)}</div>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:22px 4px 0;color:#6F819A;font-size:12px;line-height:1.7;">
                ${footerText}<br />
                <a href="${SITE_URL}/profile" style="color:#8FA2BA;text-decoration:underline;">Notification settings</a> · <a href="${SITE_URL}" style="color:#8FA2BA;text-decoration:none;">prophandld.com</a> · Your Property. Handled.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export async function sendRenterInviteEmail({
  to,
  landlordName,
  unitLabel,
}: {
  to: string
  landlordName: string
  unitLabel: string
}) {
  const html = baseTemplate({
    eyebrow: 'Invite',
    heading: `${escapeHtml(landlordName)} invited you to Prophandld`,
    bodyHtml: `You've been added for <strong>${escapeHtml(unitLabel)}</strong>. Sign up with this same email address and you'll be linked to your unit automatically: maintenance requests, documents, and rent payments, all in one place.`,
    ctaLabel: 'Create your account',
    ctaUrl: `${SITE_URL}/signup`,
    footerText: `You're receiving this because ${escapeHtml(landlordName)} invited you to Prophandld.`,
  })
  return sendEmail({ to, subject: `${landlordName} invited you to Prophandld`, html })
}

export async function sendContractorInviteEmail({
  to,
  landlordName,
  note,
}: {
  to: string
  landlordName: string
  note?: string | null
}) {
  const html = baseTemplate({
    eyebrow: 'Invite',
    heading: `${escapeHtml(landlordName)} invited you to Prophandld`,
    bodyHtml: `${escapeHtml(landlordName)} wants to work with you through Prophandld: sealed bidding, no platform fee, and you get paid directly the moment a job's done.${note ? `<br /><br />Their note: "${escapeHtml(note)}"` : ''} Sign up as a contractor with this same email address to get started.`,
    ctaLabel: 'Create your account',
    ctaUrl: `${SITE_URL}/signup?role=contractor`,
    footerText: `You're receiving this because ${escapeHtml(landlordName)} invited you to Prophandld.`,
  })
  return sendEmail({ to, subject: `${landlordName} invited you to Prophandld`, html })
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const WELCOME_CONTENT: Record<'landlord' | 'renter' | 'contractor', { heading: string; bodyHtml: string; ctaLabel: string; ctaPath: string }> = {
  landlord: {
    heading: 'Welcome to Prophandld',
    bodyHtml: "You're set up. Add a property, invite your tenants, and the next time something breaks, post it once — contractors bid sealed, so you're never guessing what a fair price looks like.",
    ctaLabel: 'Go to your dashboard',
    ctaPath: '/landlord',
  },
  renter: {
    heading: "You're in",
    bodyHtml: "Something broken? Report it in a few taps, no digging through old texts for your landlord's number. You can also see your lease documents and pay rent right from here.",
    ctaLabel: 'Go to your dashboard',
    ctaPath: '/renter',
  },
  contractor: {
    heading: 'Welcome to Prophandld',
    bodyHtml: "Real jobs near you, sealed bids so you're never guessing what to quote, and payment the moment a landlord confirms the work's done.",
    ctaLabel: 'Go to your dashboard',
    ctaPath: '/contractor',
  },
}

// Sent once, right when an account first goes from "confirmed" to actually
// signed in — not on every login. See the auto-detected-session branch in
// /login, the one place this fires from.
export async function sendWelcomeEmail({
  to,
  name,
  role,
}: {
  to: string
  name?: string | null
  role: 'landlord' | 'renter' | 'contractor'
}) {
  const content = WELCOME_CONTENT[role]
  const firstName = name?.trim().split(' ')[0]
  const html = baseTemplate({
    eyebrow: 'Welcome',
    heading: firstName ? `Welcome, ${escapeHtml(firstName)}` : content.heading,
    bodyHtml: content.bodyHtml,
    ctaLabel: content.ctaLabel,
    ctaUrl: `${SITE_URL}${content.ctaPath}`,
    footerText: 'Sent once, the first time you signed in.',
  })
  return sendEmail({ to, subject: content.heading, html })
}

export async function sendCredentialSubmittedAdminEmail({
  contractorName,
  contractorEmail,
  requirementName,
  issuer,
}: {
  contractorName: string
  contractorEmail: string
  requirementName: string
  issuer: string
}) {
  const html = baseTemplate({
    eyebrow: 'Verification',
    heading: 'A credential is waiting for review',
    bodyHtml: `<strong>${escapeHtml(contractorName)}</strong> (${escapeHtml(contractorEmail)}) submitted <strong>${escapeHtml(requirementName)}</strong>, issued by ${escapeHtml(issuer)}. Open it, check it against the official record, then approve or reject.`,
    ctaLabel: 'Review credential',
    ctaUrl: `${SITE_URL}/admin/contractors`,
  })
  return sendEmail({ to: 'admin@prophandld.com', subject: `Credential to review: ${requirementName} (${contractorName})`, html })
}

export type CredentialExpiryItem = { name: string; expiry: string; stage: 1 | 2 | 3 }

// stage 1 = within 30 days, 2 = within 7 days, 3 = expired.
export async function sendCredentialExpiryEmail({
  to,
  contractorName,
  items,
}: {
  to: string
  contractorName: string
  items: CredentialExpiryItem[]
}) {
  const anyExpired = items.some((i) => i.stage === 3)
  const lines = items
    .map((i) => {
      const date = new Date(i.expiry + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      const when = i.stage === 3 ? `expired on ${date}` : `expires ${date}`
      return `<li><strong>${escapeHtml(i.name)}</strong> ${when}</li>`
    })
    .join('')
  const html = baseTemplate({
    eyebrow: anyExpired ? 'Expired' : 'Renewal',
    heading: anyExpired ? 'A credential on your profile has expired' : 'A credential on your profile is expiring soon',
    bodyHtml: `Hi ${escapeHtml(contractorName)},<ul style="padding-left:18px;margin:12px 0;">${lines}</ul>${
      anyExpired
        ? 'Landlords no longer see expired credentials next to your bids. Upload the renewal and we\'ll review it.'
        : 'Upload the renewal before it lapses so landlords keep seeing it next to your bids.'
    }`,
    ctaLabel: 'Update credentials',
    ctaUrl: `${SITE_URL}/contractor/settings`,
    footerText: 'Sent because you have credentials on file with Prophandld.',
  })
  return sendEmail({
    to,
    subject: anyExpired ? 'A credential on your Prophandld profile has expired' : 'A credential on your Prophandld profile is expiring soon',
    html,
  })
}

export type NotifyType =
  | 'job_reported'
  | 'bid_received'
  | 'contractor_selected'
  | 'schedule_proposed'
  | 'schedule_confirmed'
  | 'job_pending_review'
  | 'job_completed'
  | 'job_declined'
  | 'price_change_requested'
  | 'price_change_approved'
  | 'price_change_rejected'
  | 'clarification_requested'
  | 'clarification_responded'
  | 'contractor_cancelled'
  | 'job_open'

type NotifyRole = 'landlord' | 'renter' | 'contractor'

export interface NotifyJobInfo {
  jobId: string
  category: string
  address: string | null
  city: string | null
  isEmergency?: boolean
  // Optional details. When the server can look them up they make the message
  // say what actually happened (which time, how much, who) instead of only
  // "something changed". Every field is safe to leave out.
  unit?: string | null
  when?: string | null
  amount?: number | null
  requestedAmount?: number | null
  contractorName?: string | null
  // Only meaningful on the accepted bid: whether the landlord has actually
  // paid yet. Undefined means "don't know" (most events never load it) —
  // never treated the same as 'unpaid', which is an asserted fact.
  paymentStatus?: 'paid' | 'processing' | 'unpaid' | null
}

function jobLocation(info: NotifyJobInfo) {
  return [info.address, info.city].filter(Boolean).join(', ') || 'your property'
}

function money(value: number) {
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`
}

// What a person sees on their lock screen. Title says what happened, body says
// where and what to do next. Prices only go to people who already see them.
// Renters never see what a job costs, so a price can't slip into their message
// even if a template forgets to leave it out.
function forRole(role: NotifyRole, info: NotifyJobInfo): NotifyJobInfo {
  return role === 'renter' ? { ...info, amount: null, requestedAmount: null } : info
}

function pushCopy(type: NotifyType, role: NotifyRole, rawInfo: NotifyJobInfo): { title: string; body: string } {
  const info = forRole(role, rawInfo)
  const cat = info.category
  const where = jobLocation(info)
  const who = info.contractorName || 'The contractor'
  switch (type) {
    case 'job_open':
      return {
        title: `${info.isEmergency ? 'Emergency: ' : ''}New ${cat} job near you`,
        body: `${info.city || where}. Bids are sealed. Tap to view and bid.`,
      }
    case 'job_reported':
      return { title: `${info.isEmergency ? 'Emergency: ' : ''}New ${cat} issue reported`, body: `${where}. Tap to acknowledge.` }
    case 'bid_received':
      return {
        title: info.amount != null ? `New bid: ${money(info.amount)} for ${cat}` : `New bid on your ${cat} job`,
        body: `${info.contractorName ? `${info.contractorName} · ` : ''}${where}`,
      }
    case 'contractor_selected':
      return { title: `You got the ${cat} job`, body: `${where}. Tap to set a time.` }
    case 'schedule_proposed':
      return {
        title: info.when ? `Time proposed: ${info.when}` : 'New time proposed',
        body: `${cat} · ${where}. Tap to confirm or suggest another.`,
      }
    case 'schedule_confirmed':
      return { title: info.when ? `Confirmed: ${info.when}` : 'Visit confirmed', body: `${cat} · ${where}` }
    case 'job_pending_review':
      return { title: `${who} finished the ${cat} work`, body: `${where}. Review and approve. It auto-approves in 3 days.` }
    case 'job_completed': {
      const paidPush = info.paymentStatus === 'paid'
      return {
        title: role === 'contractor' ? `Work approved: ${cat}` : `${cat} repair closed`,
        body:
          role === 'contractor'
            ? paidPush
              ? `${where}. Paid — check Earnings for your receipt.`
              : `${where}. Payment is on its way.`
            : `${where}. All done.`,
      }
    }
    case 'job_declined':
      return { title: `Report declined: ${cat}`, body: `${where}. Tap to see why.` }
    case 'price_change_requested':
      return {
        title:
          info.amount != null && info.requestedAmount != null
            ? `Price change: ${money(info.amount)} to ${money(info.requestedAmount)}`
            : 'Price change requested',
        body: `${cat} · ${where}. Tap to approve or decline.`,
      }
    case 'price_change_approved':
      return { title: 'Price change approved', body: `${cat} · ${where}. You can carry on.` }
    case 'price_change_rejected':
      return { title: 'Price change declined', body: `${cat} · ${where}. The original price stands.` }
    case 'clarification_requested':
      return { title: 'The landlord has a question', body: `${cat} · ${where}. Tap to reply.` }
    case 'clarification_responded':
      return { title: `${who} replied`, body: `${cat} · ${where}` }
    case 'contractor_cancelled':
      return {
        title: 'Contractor cancelled',
        body: role === 'landlord' ? `${cat} · ${where}. Back open for bids.` : `${cat} · ${where}. The landlord is finding a replacement.`,
      }
  }
}

export function buildPushMessage(type: NotifyType, role: NotifyRole, info: NotifyJobInfo) {
  const { title, body } = pushCopy(type, role, info)
  return {
    title,
    body,
    url: type === 'job_open' ? `${SITE_URL}/contractor/jobs/${info.jobId}/bid` : `${SITE_URL}/${role}/jobs/${info.jobId}`,
    // One live notification per job: a newer update replaces the older one
    // instead of stacking five near-identical banners.
    tag: `job-${info.jobId}`,
    // "High" urgency asks the phone to wake up and deliver right away rather
    // than batch for battery savings — reserved for the two events that are
    // actually urgent, and only when the job itself is flagged emergency.
    urgent: (type === 'job_reported' || type === 'job_open') && !!info.isEmergency,
  }
}

// SMS costs money per message and requires opt-in consent, so only a
// curated high-value subset of events ever reach sendSms — everything
// else stays email/push-only.
export const SMS_ENABLED_TYPES: NotifyType[] = [
  'job_reported',
  'job_open',
  'schedule_proposed',
  'schedule_confirmed',
  'job_pending_review',
]

export function buildSmsMessage(type: NotifyType, info: NotifyJobInfo) {
  const { title } = pushCopy(type, 'landlord', info)
  return `Prophandld: ${title}. ${info.category} at ${jobLocation(info)}.`
}

export function buildNotificationEmail(type: NotifyType, role: NotifyRole, rawInfo: NotifyJobInfo) {
  const info = forRole(role, rawInfo)
  const ctaUrl = `${SITE_URL}/${role}/jobs/${info.jobId}`
  const cat = escapeHtml(info.category)
  const at = escapeHtml(jobLocation(info))
  const who = info.contractorName ? escapeHtml(info.contractorName) : 'The contractor'
  const jobFact: EmailFact = { label: 'Job', value: info.category }
  const whereFact: EmailFact = { label: 'Where', value: jobLocation(info) }
  const unitFact: EmailFact | null = info.unit ? { label: 'Unit', value: info.unit } : null
  const whenFact: EmailFact | null = info.when ? { label: 'When', value: info.when } : null
  const compact = (list: Array<EmailFact | null | false | undefined>) => list.filter((f): f is EmailFact => !!f)

  switch (type) {
    case 'job_open':
      return {
        subject: `${info.isEmergency ? 'Emergency: ' : ''}New ${info.category} job near you`,
        html: baseTemplate({
          eyebrow: info.isEmergency ? 'Emergency job' : 'New job near you',
          heading: `${cat} job open for bids`,
          bodyHtml: `A landlord near you just opened this job for bidding${info.isEmergency ? ' and marked it as an <strong>emergency</strong>' : ''}. Your bid is sealed: other contractors can't see it.`,
          preheader: `${info.city || jobLocation(info)}. Sealed bidding, only the landlord sees your price.`,
          stage: 1,
          facts: compact([jobFact, whereFact, unitFact, info.isEmergency ? { label: 'Urgency', value: 'Emergency' } : null]),
          ctaLabel: 'View job and bid',
          ctaUrl: `${SITE_URL}/contractor/jobs/${info.jobId}/bid`,
        }),
      }
    case 'job_reported':
      return {
        subject: `${info.isEmergency ? 'Emergency: ' : ''}New ${info.category} issue at ${info.address || 'your property'}`,
        html: baseTemplate({
          eyebrow: info.isEmergency ? 'Emergency' : 'New issue',
          heading: 'A tenant reported an issue',
          bodyHtml: `Your tenant reported a <strong>${cat}</strong> issue. Acknowledge it to open the job for bids, or decline it if it isn't needed.`,
          preheader: `${jobLocation(info)}. Acknowledge it to start getting bids.`,
          stage: 0,
          facts: compact([jobFact, whereFact, unitFact, info.isEmergency ? { label: 'Urgency', value: 'Emergency' } : null]),
          ctaLabel: 'Review the issue',
          ctaUrl,
        }),
      }
    case 'bid_received':
      return {
        subject: info.amount != null ? `New bid: ${money(info.amount)} on your ${info.category} job` : `New bid on your ${info.category} job`,
        html: baseTemplate({
          eyebrow: 'New bid',
          heading: info.amount != null ? `New bid: ${money(info.amount)}` : 'You received a new bid',
          bodyHtml: `${info.contractorName ? `<strong>${who}</strong> submitted` : 'A contractor submitted'} a sealed bid on your <strong>${cat}</strong> job. Compare all bids side by side and pick who you want.`,
          preheader: `${info.contractorName ? `${info.contractorName} · ` : ''}${jobLocation(info)}`,
          stage: 1,
          facts: compact([
            info.amount != null && { label: 'Bid', value: money(info.amount) },
            info.contractorName ? { label: 'From', value: info.contractorName } : null,
            jobFact,
            whereFact, unitFact,
          ]),
          ctaLabel: 'Compare bids',
          ctaUrl,
          note: 'Bids are sealed: contractors can\'t see each other\'s prices.',
        }),
      }
    case 'contractor_selected':
      return {
        subject: `You got the ${info.category} job`,
        html: baseTemplate({
          eyebrow: 'You were selected',
          heading: 'You got the job',
          bodyHtml: `The landlord chose your bid for a <strong>${cat}</strong> job. Next step: agree on a time that works for the tenant.`,
          preheader: `${jobLocation(info)}. Tap to set a time.`,
          stage: 2,
          facts: compact([jobFact, whereFact, unitFact, info.amount != null && { label: 'Your price', value: money(info.amount) }]),
          ctaLabel: 'Set a time',
          ctaUrl,
        }),
      }
    case 'schedule_proposed':
      return {
        subject: info.when ? `Time proposed: ${info.when}` : `New time proposed: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Scheduling',
          heading: info.when ? `Visit proposed for ${escapeHtml(info.when)}` : 'A new time was proposed',
          bodyHtml: `A visit for the <strong>${cat}</strong> job was proposed. Confirm it, or suggest a time that suits you better.`,
          preheader: `${info.when ? `${info.when}. ` : ''}Confirm it or suggest another time.`,
          stage: 2,
          facts: compact([whenFact, jobFact, whereFact, unitFact]),
          ctaLabel: 'Confirm or change',
          ctaUrl,
        }),
      }
    case 'schedule_confirmed':
      return {
        subject: info.when ? `Confirmed: ${info.when}` : `Visit confirmed: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Confirmed',
          heading: info.when ? `Visit confirmed for ${escapeHtml(info.when)}` : 'Visit confirmed',
          bodyHtml: `Everyone agreed on a time for the <strong>${cat}</strong> job. It's on the calendar.`,
          preheader: `${info.when ? `${info.when}. ` : ''}${jobLocation(info)}`,
          stage: 3,
          facts: compact([whenFact, jobFact, whereFact, unitFact]),
          ctaLabel: 'View job',
          ctaUrl,
          note: 'Need to change it? Open the job and propose a new time.',
        }),
      }
    case 'job_pending_review':
      return {
        subject: `${info.contractorName || 'Your contractor'} finished the ${info.category} work`,
        html: baseTemplate({
          eyebrow: 'Your review needed',
          heading: 'The work is finished',
          bodyHtml: `${info.contractorName ? `<strong>${who}</strong> marked` : 'The contractor marked'} the <strong>${cat}</strong> job as complete. Check the before and after photos, then approve.`,
          preheader: `Review the photos and approve. It auto-approves in 3 days.`,
          stage: 4,
          facts: compact([
            info.contractorName ? { label: 'Contractor', value: info.contractorName } : null,
            info.amount != null && { label: 'Price', value: money(info.amount) },
            jobFact,
            whereFact, unitFact,
          ]),
          ctaLabel: 'Review and approve',
          ctaUrl,
          note: "If you don't respond within 3 days, the job is approved automatically.",
        }),
      }
    case 'job_completed': {
      // A contractor's own payment can lag the approval itself — a bank
      // transfer clears over a few days, and a job the 3-day auto-approval
      // moved along has no payment started at all yet. Never say "Paid"
      // unless it's actually true.
      const paid = info.paymentStatus === 'paid'
      const processing = info.paymentStatus === 'processing'
      const contractorHeading = paid ? 'Your work was approved and paid' : 'Your work was approved'
      const contractorBody = paid
        ? `The landlord approved your work on the <strong>${cat}</strong> job at ${at}, and payment is on its way. Check Earnings for the receipt.`
        : processing
          ? `The landlord approved your work on the <strong>${cat}</strong> job at ${at}. Payment has started and is clearing — that usually takes 1 to 3 business days.`
          : `The landlord approved your work on the <strong>${cat}</strong> job at ${at}. Payment is next — we'll email you the moment it's sent.`
      return {
        subject: `Job closed: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Job closed',
          heading: role === 'contractor' ? contractorHeading : 'The repair is finished',
          bodyHtml: role === 'contractor' ? contractorBody : `The <strong>${cat}</strong> repair at ${at} is finished and closed. Thanks for reporting it.`,
          preheader:
            role === 'contractor'
              ? paid
                ? 'Approved and paid. Check Earnings for your receipt.'
                : 'Approved. Payment is on its way — check Earnings for updates.'
              : `${jobLocation(info)}. All done.`,
          // The tracker's last step is "Paid" — only light it up as reached
          // once payment genuinely succeeded, otherwise stop one step short
          // at "Review" so the bar never claims something that hasn't happened.
          stage: role === 'contractor' && !paid ? 4 : 5,
          facts: compact([jobFact, whereFact, unitFact, role === 'contractor' && info.amount != null && { label: 'Price', value: money(info.amount) }]),
          ctaLabel: role === 'contractor' ? 'View earnings' : 'View job',
          ctaUrl: role === 'contractor' ? `${SITE_URL}/contractor` : ctaUrl,
        }),
      }
    }
    case 'job_declined':
      return {
        subject: `Update on your ${info.category} report`,
        html: baseTemplate({
          eyebrow: 'Report update',
          heading: 'Your landlord declined this report',
          bodyHtml: `Your landlord declined the <strong>${cat}</strong> report at ${at}. Open the job to see any note they left. You can message them from there.`,
          preheader: `${jobLocation(info)}. Open the job to see why.`,
          facts: compact([jobFact, whereFact, unitFact]),
          ctaLabel: 'See the details',
          ctaUrl,
        }),
      }
    case 'price_change_requested':
      return {
        subject:
          info.amount != null && info.requestedAmount != null
            ? `Price change: ${money(info.amount)} to ${money(info.requestedAmount)}`
            : `Price change requested: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Needs your decision',
          heading: 'A price change was requested',
          bodyHtml: `${info.contractorName ? `<strong>${who}</strong> is asking` : 'The contractor is asking'} to change the price on your <strong>${cat}</strong> job, with a labor and parts breakdown. Approve or decline it.`,
          preheader:
            info.amount != null && info.requestedAmount != null
              ? `From ${money(info.amount)} to ${money(info.requestedAmount)}. Tap to review the breakdown.`
              : 'Tap to review the breakdown.',
          stage: 3,
          facts: compact([
            info.amount != null && { label: 'Current price', value: money(info.amount) },
            info.requestedAmount != null && { label: 'Requested price', value: money(info.requestedAmount) },
            info.amount != null && info.requestedAmount != null && {
              label: 'Difference',
              value: `${info.requestedAmount >= info.amount ? '+' : '-'}${money(Math.abs(info.requestedAmount - info.amount))}`,
            },
            jobFact,
          ]),
          ctaLabel: 'Review the request',
          ctaUrl,
        }),
      }
    case 'price_change_approved':
      return {
        subject: `Price change approved: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Approved',
          heading: 'Your new price was approved',
          bodyHtml: `The landlord approved your new price for the <strong>${cat}</strong> job at ${at}. You're clear to continue.`,
          preheader: info.amount != null ? `New price: ${money(info.amount)}. You can carry on.` : 'You can carry on.',
          stage: 3,
          facts: compact([info.amount != null && { label: 'New price', value: money(info.amount) }, jobFact, whereFact, unitFact]),
          ctaLabel: 'View job',
          ctaUrl,
        }),
      }
    case 'price_change_rejected':
      return {
        subject: `Price change declined: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Declined',
          heading: 'Your price change was declined',
          bodyHtml: `The landlord declined the new price for the <strong>${cat}</strong> job at ${at}. The original price stays in effect.`,
          preheader: info.amount != null ? `The original price of ${money(info.amount)} stands.` : 'The original price stands.',
          stage: 3,
          facts: compact([info.amount != null && { label: 'Price', value: money(info.amount) }, jobFact, whereFact, unitFact]),
          ctaLabel: 'View job',
          ctaUrl,
        }),
      }
    case 'clarification_requested':
      return {
        subject: `The landlord has a question: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Question',
          heading: 'The landlord has a question',
          bodyHtml: `Before approving the <strong>${cat}</strong> job at ${at}, the landlord asked for more detail. Reply in the job chat.`,
          preheader: 'Reply in the job chat so they can approve.',
          stage: 4,
          facts: compact([jobFact, whereFact, unitFact]),
          ctaLabel: 'Reply now',
          ctaUrl,
        }),
      }
    case 'clarification_responded':
      return {
        subject: `${info.contractorName || 'The contractor'} replied: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Reply',
          heading: 'The contractor replied',
          bodyHtml: `${info.contractorName ? `<strong>${who}</strong> replied` : 'The contractor replied'} to your question on the <strong>${cat}</strong> job at ${at}.`,
          preheader: 'Read the reply and approve when you are ready.',
          stage: 4,
          facts: compact([jobFact, whereFact, unitFact]),
          ctaLabel: 'View reply',
          ctaUrl,
        }),
      }
    case 'contractor_cancelled':
      return {
        subject: `Contractor cancelled: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Job update',
          heading: 'The contractor had to cancel',
          bodyHtml:
            role === 'landlord'
              ? `The contractor for your <strong>${cat}</strong> job at ${at} can't do it anymore. The job is open for sealed bids again, and nearby contractors were alerted.`
              : `The contractor for the <strong>${cat}</strong> job at ${at} can't do it anymore. The landlord is finding a replacement. Nothing is needed from you.`,
          preheader: role === 'landlord' ? 'Back open for bids. Nearby contractors were alerted.' : 'The landlord is finding a replacement.',
          stage: 1,
          facts: compact([jobFact, whereFact, unitFact]),
          ctaLabel: 'View job',
          ctaUrl,
        }),
      }
  }
}

export async function sendRentPaymentReceivedEmail({
  to,
  landlordName,
  amount,
  monthLabel,
  unitLabel,
}: {
  to: string
  landlordName: string
  amount: number
  monthLabel: string
  unitLabel: string
}) {
  const html = baseTemplate({
    eyebrow: 'Payment',
    heading: 'Rent payment received',
    bodyHtml: `Hi ${escapeHtml(landlordName)}, a rent payment of <strong>$${amount.toFixed(2)}</strong> for ${escapeHtml(monthLabel)} came in for <strong>${escapeHtml(unitLabel)}</strong>. It's already on its way to your bank account.`,
    preheader: `${monthLabel} · ${unitLabel}. On its way to your bank account.`,
    facts: [
      { label: 'Amount', value: `$${amount.toFixed(2)}` },
      { label: 'For', value: monthLabel },
      { label: 'Unit', value: unitLabel },
    ],
    ctaLabel: 'View rent history',
    ctaUrl: `${SITE_URL}/landlord`,
    note: 'Your bank sets the final arrival time.',
  })
  return sendEmail({ to, subject: `Rent received: $${amount.toFixed(2)} for ${unitLabel}`, html })
}

export async function sendChatMessageEmail({
  to,
  senderName,
  context,
  preview,
  ctaUrl,
}: {
  to: string
  senderName: string
  context: string
  preview: string
  ctaUrl: string
}) {
  const html = baseTemplate({
    eyebrow: 'Message',
    heading: `${escapeHtml(senderName)} sent you a message`,
    bodyHtml: `${escapeHtml(context)}<br /><br />"${escapeHtml(preview)}"`,
    preheader: preview,
    ctaLabel: 'Open chat',
    ctaUrl,
    note: 'You will only get one email for a run of messages. New ones keep arriving in the app.',
  })
  return sendEmail({ to, subject: `${senderName}: ${preview.length > 60 ? `${preview.slice(0, 57)}...` : preview}`, html })
}

export async function sendJobPaymentReceiptEmail({
  to,
  landlordName,
  contractorName,
  amount,
  category,
  propertyLabel,
  bidId,
}: {
  to: string
  landlordName: string
  contractorName: string
  amount: number
  category: string
  propertyLabel: string
  bidId: string
}) {
  const html = baseTemplate({
    eyebrow: 'Receipt',
    heading: 'Payment receipt',
    bodyHtml: `Hi ${escapeHtml(landlordName)}, your payment of <strong>$${amount.toFixed(2)}</strong> to <strong>${escapeHtml(contractorName)}</strong> for the <strong>${escapeHtml(category)}</strong> job at ${escapeHtml(propertyLabel)} went through. Your receipt is saved on the job for your records.`,
    preheader: `$${amount.toFixed(2)} to ${contractorName} for ${category}.`,
    facts: [
      { label: 'Amount', value: `$${amount.toFixed(2)}` },
      { label: 'Paid to', value: contractorName },
      { label: 'Job', value: category },
      { label: 'Where', value: propertyLabel },
    ],
    ctaLabel: 'View receipt',
    ctaUrl: `${SITE_URL}/receipts/job/${bidId}`,
  })
  return sendEmail({ to, subject: `Receipt: $${amount.toFixed(2)} paid for ${category}`, html })
}

export async function sendJobAutoApprovedPayNowEmail({
  to,
  landlordName,
  contractorName,
  amount,
  category,
  propertyLabel,
  jobId,
}: {
  to: string
  landlordName: string
  contractorName: string
  amount: number
  category: string
  propertyLabel: string
  jobId: string
}) {
  const html = baseTemplate({
    eyebrow: 'Action needed',
    heading: 'We approved this job for you',
    bodyHtml: `Hi ${escapeHtml(landlordName)}, nobody reviewed the <strong>${escapeHtml(category)}</strong> job at ${escapeHtml(propertyLabel)} within 3 days of <strong>${escapeHtml(contractorName)}</strong> finishing it, so it was approved automatically so they aren't left waiting. ${escapeHtml(contractorName)} still hasn't been paid — that part is never automatic.`,
    preheader: `${escapeHtml(contractorName)} is waiting on $${amount.toFixed(2)}. Pay now to release it.`,
    facts: [
      { label: 'Amount due', value: `$${amount.toFixed(2)}` },
      { label: 'Contractor', value: contractorName },
      { label: 'Job', value: category },
      { label: 'Where', value: propertyLabel },
    ],
    ctaLabel: 'Pay now',
    ctaUrl: `${SITE_URL}/landlord/jobs/${jobId}`,
    note: 'This approved itself because nobody responded in 3 days. Paying the contractor still takes one tap from you.',
  })
  return sendEmail({ to, subject: `Action needed: pay ${contractorName} $${amount.toFixed(2)} for ${category}`, html })
}

// One digest to the Prophandld inbox whenever the daily check auto-approves
// anything, so a person sees it the same day rather than a contractor
// discovering days later that nobody ever paid them.
export async function sendAutoApprovalDigestAdminEmail({
  jobs,
}: {
  jobs: { category: string; propertyLabel: string; contractorName: string; amount: number; jobId: string }[]
}) {
  if (jobs.length === 0) return
  const rows = jobs
    .map((j) => `<li style="margin-bottom:6px;">${escapeHtml(j.category)} at ${escapeHtml(j.propertyLabel)} — ${escapeHtml(j.contractorName)} is owed $${j.amount.toFixed(2)}</li>`)
    .join('')
  const html = baseTemplate({
    eyebrow: 'Auto-approved',
    heading: `${jobs.length} job${jobs.length === 1 ? '' : 's'} auto-approved today`,
    bodyHtml: `No landlord response within 3 days, so ${jobs.length === 1 ? 'this job was' : 'these were'} approved automatically and the landlord was emailed to pay. Nothing forces them to — worth a manual check if any stay unpaid.<ul style="margin:14px 0 0;padding-left:20px;color:#A9B7C8;font-size:14px;line-height:1.6;">${rows}</ul>`,
    preheader: `${jobs.length} landlord${jobs.length === 1 ? '' : 's'} emailed to pay. Nothing is guaranteed until they do.`,
    ctaLabel: 'Open admin jobs',
    ctaUrl: `${SITE_URL}/admin/jobs`,
  })
  return sendEmail({ to: 'admin@prophandld.com', subject: `${jobs.length} job(s) auto-approved — payment not guaranteed`, html })
}

export async function sendJobPaymentSentEmail({
  to,
  contractorName,
  amount,
  category,
  propertyLabel,
  bidId,
}: {
  to: string
  contractorName: string
  amount: number
  category: string
  propertyLabel: string
  bidId: string
}) {
  const html = baseTemplate({
    eyebrow: 'Payment',
    heading: "You've been paid",
    bodyHtml: `Hi ${escapeHtml(contractorName)}, you were paid <strong>$${amount.toFixed(2)}</strong> for the <strong>${escapeHtml(category)}</strong> job at ${escapeHtml(propertyLabel)}. It's on its way to your bank account.`,
    preheader: `$${amount.toFixed(2)} for ${category}. On its way to your bank account.`,
    facts: [
      { label: 'Amount', value: `$${amount.toFixed(2)}` },
      { label: 'Job', value: category },
      { label: 'Where', value: propertyLabel },
    ],
    ctaLabel: 'View payment receipt',
    ctaUrl: `${SITE_URL}/receipts/job/${bidId}`,
    note: 'Your bank sets the final arrival time. All your payments are under Earnings.',
  })
  return sendEmail({ to, subject: `You've been paid $${amount.toFixed(2)}: ${category}`, html })
}

export async function sendContractorVerificationDecisionEmail({
  to,
  contractorName,
  approved,
  notes,
}: {
  to: string
  contractorName: string
  approved: boolean
  notes?: string | null
}) {
  const html = baseTemplate({
    eyebrow: 'Verification',
    heading: approved ? "You're verified ✓" : 'Verification update',
    bodyHtml: approved
      ? `Hi ${escapeHtml(contractorName)}, your license and insurance were reviewed and approved. Landlords will now see a "Verified" badge on your bids.`
      : `Hi ${escapeHtml(contractorName)}, your verification submission wasn't approved.${notes ? ` Note from our team: ${escapeHtml(notes)}` : ''} You can update your documents and resubmit anytime.`,
    ctaLabel: 'View settings',
    ctaUrl: `${SITE_URL}/contractor/settings`,
  })
  return sendEmail({
    to,
    subject: approved ? "You're verified on Prophandld" : 'Update on your Prophandld verification',
    html,
  })
}

export async function sendDisputeRaisedAdminEmail({
  jobCategory,
  propertyLabel,
  raisedByRole,
  reason,
  jobId,
}: {
  jobCategory: string
  propertyLabel: string
  raisedByRole: string
  reason: string
  jobId: string
}) {
  const html = baseTemplate({
    eyebrow: 'Dispute',
    heading: 'A dispute was raised',
    bodyHtml: `A ${escapeHtml(raisedByRole)} raised a dispute on the <strong>${escapeHtml(jobCategory)}</strong> job at ${escapeHtml(propertyLabel)}.<br /><br />"${escapeHtml(reason)}"`,
    ctaLabel: 'Review dispute',
    ctaUrl: `${SITE_URL}/admin/disputes`,
  })
  return sendEmail({ to: 'admin@prophandld.com', subject: `Dispute raised: ${jobCategory} (job ${jobId.slice(0, 8)})`, html })
}

export async function sendDisputeResolvedEmail({
  to,
  jobCategory,
  propertyLabel,
  outcome,
  resolutionNotes,
  role,
  jobId,
}: {
  to: string
  jobCategory: string
  propertyLabel: string
  outcome: string
  resolutionNotes?: string | null
  role: 'landlord' | 'renter' | 'contractor'
  jobId: string
}) {
  const outcomeLabel = outcome === 'landlord' ? 'in favor of the landlord' : outcome === 'contractor' ? 'in favor of the contractor' : 'with a neutral outcome'
  const html = baseTemplate({
    eyebrow: 'Dispute',
    heading: 'Your dispute was resolved',
    bodyHtml: `The dispute on the <strong>${escapeHtml(jobCategory)}</strong> job at ${escapeHtml(propertyLabel)} has been resolved ${escapeHtml(outcomeLabel)}.${resolutionNotes ? `<br /><br />"${escapeHtml(resolutionNotes)}"` : ''}`,
    ctaLabel: 'View job',
    ctaUrl: `${SITE_URL}/${role}/jobs/${jobId}`,
  })
  return sendEmail({ to, subject: `Dispute resolved: ${jobCategory}`, html })
}

export async function sendCreditCardRejectedEmail({ to, renterName }: { to: string; renterName: string }) {
  const html = baseTemplate({
    eyebrow: 'Payment',
    heading: 'Payment refunded',
    bodyHtml: `Hi ${escapeHtml(renterName)}, rent can only be paid by <strong>debit card or bank account</strong>. Credit cards aren't accepted. Your payment was fully refunded and rent is still due. Please try again with a debit card or bank transfer.`,
    ctaLabel: 'Try again',
    ctaUrl: `${SITE_URL}/renter/rent`,
  })
  return sendEmail({ to, subject: 'Your rent payment was refunded', html })
}

export async function sendRentDueEmail({ to, landlordName, unitLabels }: { to: string; landlordName: string; unitLabels: string[] }) {
  const monthLabel = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const list = unitLabels.length === 1 ? unitLabels[0] : `${unitLabels.length} units`
  const html = baseTemplate({
    eyebrow: 'Payment',
    heading: `Rent is due: ${escapeHtml(monthLabel)}`,
    bodyHtml: `Hi ${escapeHtml(landlordName)}, ${escapeHtml(monthLabel)} rent tracking is ready for ${escapeHtml(list)}. Mark it received in one tap once it comes in, no typing required.`,
    ctaLabel: 'View dashboard',
    ctaUrl: `${SITE_URL}/landlord`,
  })
  return sendEmail({ to, subject: `Rent due: ${monthLabel}`, html })
}

export async function sendRentDueRenterEmail({ to, unitLabel, amount }: { to: string; unitLabel: string; amount: number }) {
  const monthLabel = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const html = baseTemplate({
    eyebrow: 'Payment',
    heading: `Rent is due: ${escapeHtml(monthLabel)}`,
    bodyHtml: `$${amount.toFixed(2)} is due for ${escapeHtml(unitLabel)}. Pay by debit card or bank account, right from your dashboard.`,
    ctaLabel: 'Pay rent',
    ctaUrl: `${SITE_URL}/renter/rent`,
  })
  return sendEmail({ to, subject: `Rent due: ${monthLabel}`, html })
}

export async function sendRentLateRenterEmail({ to, unitLabel, amount, lateFeeAdded }: { to: string; unitLabel: string; amount: number; lateFeeAdded: number | null }) {
  const html = baseTemplate({
    eyebrow: 'Payment',
    heading: 'Rent is now late',
    bodyHtml: `Rent for ${escapeHtml(unitLabel)} is still unpaid.${lateFeeAdded ? ` A $${lateFeeAdded.toFixed(2)} late fee has been added.` : ''} $${amount.toFixed(2)} is now due. Pay as soon as you can.`,
    ctaLabel: 'Pay rent',
    ctaUrl: `${SITE_URL}/renter/rent`,
  })
  return sendEmail({ to, subject: `Rent is late: ${unitLabel}`, html })
}

export async function sendRentLateLandlordEmail({ to, landlordName, unitLabel, lateFeeAdded }: { to: string; landlordName: string; unitLabel: string; lateFeeAdded: number | null }) {
  const html = baseTemplate({
    eyebrow: 'Payment',
    heading: 'Rent is now late',
    bodyHtml: `Hi ${escapeHtml(landlordName)}, rent for ${escapeHtml(unitLabel)} is past due and still unpaid.${lateFeeAdded ? ` A $${lateFeeAdded.toFixed(2)} late fee was automatically added.` : ' The renter has been notified.'}`,
    ctaLabel: 'View dashboard',
    ctaUrl: `${SITE_URL}/landlord`,
  })
  return sendEmail({ to, subject: `Rent is late: ${unitLabel}`, html })
}

export async function sendSupportEscalationEmail({
  askerEmail,
  question,
}: {
  askerEmail: string
  question: string
}) {
  const html = baseTemplate({
    eyebrow: 'Support',
    heading: 'A question from the landing page',
    bodyHtml: `<strong>${escapeHtml(askerEmail)}</strong> asked:<br /><br />"${escapeHtml(question)}"`,
    ctaLabel: 'Reply to asker',
    ctaUrl: `mailto:${escapeHtml(askerEmail)}`,
  })
  return sendEmail({ to: 'admin@prophandld.com', subject: `Support question from ${askerEmail}`, html })
}

export async function sendSupportConfirmationEmail({ to, question }: { to: string; question: string }) {
  const html = baseTemplate({
    eyebrow: 'Support',
    heading: 'Got it, thanks for reaching out',
    bodyHtml: `Thanks for reaching out to Prophandld. You asked:<br /><br />"${escapeHtml(question)}"<br /><br />A member of our team will review this and follow up at this email address soon.`,
    ctaLabel: 'Visit Prophandld',
    ctaUrl: SITE_URL,
  })
  return sendEmail({ to, subject: 'Got it, thanks for reaching out', html })
}

export async function sendDmScheduleEmail({
  to,
  fromName,
  text,
  kind,
  role,
  threadId,
}: {
  to: string
  fromName: string
  text: string
  kind: 'proposed' | 'confirmed'
  role: 'landlord' | 'renter' | 'contractor'
  threadId: string
}) {
  const heading = kind === 'proposed' ? `${fromName} proposed a time` : `${fromName} confirmed a time`
  const html = baseTemplate({
    eyebrow: 'Schedule',
    heading: escapeHtml(heading),
    bodyHtml: escapeHtml(text),
    ctaLabel: 'Open conversation',
    ctaUrl: `${SITE_URL}/${role}/messages/${threadId}`,
  })
  return sendEmail({ to, subject: heading, html })
}

export async function sendJobInviteEmail({
  to,
  landlordName,
  jobCategory,
  jobId,
}: {
  to: string
  landlordName: string
  jobCategory: string
  jobId: string
}) {
  const html = baseTemplate({
    eyebrow: 'New job',
    heading: `${escapeHtml(landlordName)} posted a job for you`,
    bodyHtml: `${escapeHtml(landlordName)} messaged you and just posted a new <strong>${escapeHtml(jobCategory)}</strong> job. Take a look and submit a bid if you're available. It's open to other contractors too, so don't wait too long.`,
    ctaLabel: 'View job',
    ctaUrl: `${SITE_URL}/contractor/jobs/${jobId}`,
  })
  return sendEmail({ to, subject: `New job from ${landlordName}: ${jobCategory}`, html })
}
