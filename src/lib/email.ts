import { Resend } from 'resend'
import { isPreviewDeployment } from '@/lib/env'

const SITE_URL = 'https://prophandld.com'

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

// Transactional email shell — one eyebrow label, one headline, one action.
// Deliberately plain (no hero art, no multi-column layout, no forced
// exclamation-point copy) so it reads like a real product notification
// rather than a marketing template.
function baseTemplate({
  eyebrow,
  heading,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  footerText = 'Sent because you have an active Prophandld account.',
}: {
  eyebrow: string
  heading: string
  bodyHtml: string
  ctaLabel: string
  ctaUrl: string
  footerText?: string
}) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0C1A2E;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${heading}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0C1A2E;">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding:0 4px 20px;">
                <span style="color:#ffffff;font-weight:700;font-size:15px;letter-spacing:-0.01em;">Prophandld</span>
              </td>
            </tr>
            <tr>
              <td style="background:#0F2138;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:36px 32px;">
                <span style="display:inline-block;background:linear-gradient(90deg,#0A7B7E,#12A5A9);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;padding:4px 11px;border-radius:999px;margin-bottom:18px;">${eyebrow}</span>
                <div style="color:#ffffff;font-size:21px;font-weight:700;line-height:1.3;margin:0 0 12px;">${heading}</div>
                <div style="color:rgba(255,255,255,0.55);font-size:14px;line-height:1.65;margin:0 0 28px;">${bodyHtml}</div>
                <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:linear-gradient(90deg,#0A7B7E,#12A5A9);color:#ffffff;font-weight:600;font-size:14px;padding:13px 26px;border-radius:999px;text-decoration:none;">${ctaLabel} →</a>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 4px 0;color:rgba(255,255,255,0.5);font-size:12px;line-height:1.6;">
                ${footerText}<br />
                <a href="${SITE_URL}" style="color:rgba(255,255,255,0.5);text-decoration:none;">prophandld.com</a> · Your Property. Handled.
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

export interface NotifyJobInfo {
  jobId: string
  category: string
  address: string | null
  city: string | null
  isEmergency?: boolean
}

function jobLocation(info: NotifyJobInfo) {
  return [info.address, info.city].filter(Boolean).join(', ') || 'your property'
}

const PUSH_TITLES: Record<NotifyType, string> = {
  job_reported: 'New issue reported',
  bid_received: 'New bid received',
  contractor_selected: "You've been selected",
  schedule_proposed: 'New time proposed',
  schedule_confirmed: 'Schedule confirmed',
  job_pending_review: 'Ready for your review',
  job_completed: 'Job closed out',
  job_declined: 'Issue declined',
  price_change_requested: 'Price change requested',
  price_change_approved: 'Price change approved',
  price_change_rejected: 'Price change declined',
  clarification_requested: 'The landlord has a question',
  clarification_responded: 'The contractor responded',
  contractor_cancelled: 'Contractor cancelled, job reopened',
  job_open: 'New job near you',
}

export function buildPushMessage(type: NotifyType, role: 'landlord' | 'renter' | 'contractor', info: NotifyJobInfo) {
  return {
    title: PUSH_TITLES[type],
    body: `${info.category} at ${jobLocation(info)}`,
    url: type === 'job_open' ? `${SITE_URL}/contractor/jobs/${info.jobId}/bid` : `${SITE_URL}/${role}/jobs/${info.jobId}`,
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
  return `Prophandld: ${PUSH_TITLES[type]}. ${info.category} at ${jobLocation(info)}.`
}

export function buildNotificationEmail(type: NotifyType, role: 'landlord' | 'renter' | 'contractor', info: NotifyJobInfo) {
  const ctaUrl = `${SITE_URL}/${role}/jobs/${info.jobId}`
  const at = jobLocation(info)

  switch (type) {
    case 'job_open':
      return {
        subject: `New job near you: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'New job',
          heading: 'A job near you is open for bids',
          bodyHtml: `A <strong>${escapeHtml(info.category)}</strong> job at ${escapeHtml(at)} just opened for bidding${info.isEmergency ? ' and is marked as an <strong>emergency</strong>' : ''}. Bids are sealed: no other contractor can see yours.`,
          ctaLabel: 'View and bid',
          ctaUrl: `${SITE_URL}/contractor/jobs/${info.jobId}/bid`,
        }),
      }
    case 'job_reported':
      return {
        subject: `New issue reported: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Maintenance',
          heading: 'A new issue was reported',
          bodyHtml: `A tenant reported a <strong>${escapeHtml(info.category)}</strong> issue at ${escapeHtml(at)}. Take a look and acknowledge it.`,
          ctaLabel: 'View issue',
          ctaUrl,
        }),
      }
    case 'bid_received':
      return {
        subject: `New bid on your ${info.category} job`,
        html: baseTemplate({
          eyebrow: 'Bidding',
          heading: 'You received a new bid',
          bodyHtml: `A contractor submitted a sealed bid on your <strong>${escapeHtml(info.category)}</strong> job at ${escapeHtml(at)}.`,
          ctaLabel: 'Review bids',
          ctaUrl,
        }),
      }
    case 'contractor_selected':
      return {
        subject: `You've been selected for a job`,
        html: baseTemplate({
          eyebrow: 'Job update',
          heading: "You've been selected",
          bodyHtml: `A landlord selected your bid for a <strong>${escapeHtml(info.category)}</strong> job at ${escapeHtml(at)}. Next step: schedule a time.`,
          ctaLabel: 'View job',
          ctaUrl,
        }),
      }
    case 'schedule_proposed':
      return {
        subject: `New time proposed: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Scheduling',
          heading: 'A new time was proposed',
          bodyHtml: `A time was proposed for the <strong>${escapeHtml(info.category)}</strong> job at ${escapeHtml(at)}. Confirm it or propose a different time.`,
          ctaLabel: 'Review time',
          ctaUrl,
        }),
      }
    case 'schedule_confirmed':
      return {
        subject: `Schedule confirmed: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Scheduling',
          heading: 'Schedule confirmed',
          bodyHtml: `The schedule for the <strong>${escapeHtml(info.category)}</strong> job at ${escapeHtml(at)} is confirmed.`,
          ctaLabel: 'View job',
          ctaUrl,
        }),
      }
    case 'job_pending_review':
      return {
        subject: `Contractor marked a job complete`,
        html: baseTemplate({
          eyebrow: 'Review needed',
          heading: 'Ready for your review',
          bodyHtml: `The contractor marked the <strong>${escapeHtml(info.category)}</strong> job at ${escapeHtml(at)} as complete. Review the before/after photos and approve, or ask for verification.`,
          ctaLabel: 'Review job',
          ctaUrl,
        }),
      }
    case 'job_completed':
      return {
        subject: `Job closed: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Job closed',
          heading: 'Job closed out',
          bodyHtml: `The <strong>${escapeHtml(info.category)}</strong> job at ${escapeHtml(at)} has been approved and closed.`,
          ctaLabel: 'View job',
          ctaUrl,
        }),
      }
    case 'job_declined':
      return {
        subject: `Update on your ${info.category} report`,
        html: baseTemplate({
          eyebrow: 'Job update',
          heading: 'Your reported issue was declined',
          bodyHtml: `Your landlord declined the <strong>${escapeHtml(info.category)}</strong> report at ${escapeHtml(at)}. Check the job for any notes they left.`,
          ctaLabel: 'View details',
          ctaUrl,
        }),
      }
    case 'price_change_requested':
      return {
        subject: `Price change requested: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Price change',
          heading: 'A contractor requested a price change',
          bodyHtml: `The contractor on your <strong>${escapeHtml(info.category)}</strong> job at ${escapeHtml(at)} is requesting a new price, with a labor/parts breakdown. Review it before they continue.`,
          ctaLabel: 'Review request',
          ctaUrl,
        }),
      }
    case 'price_change_approved':
      return {
        subject: `Price change approved: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Price change',
          heading: 'Your price change was approved',
          bodyHtml: `The landlord approved your new price for the <strong>${escapeHtml(info.category)}</strong> job at ${escapeHtml(at)}. You're clear to continue.`,
          ctaLabel: 'View job',
          ctaUrl,
        }),
      }
    case 'price_change_rejected':
      return {
        subject: `Price change declined: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Price change',
          heading: 'Your price change was declined',
          bodyHtml: `The landlord declined your requested price for the <strong>${escapeHtml(info.category)}</strong> job at ${escapeHtml(at)}. The original price stays in effect.`,
          ctaLabel: 'View job',
          ctaUrl,
        }),
      }
    case 'clarification_requested':
      return {
        subject: `Verification requested: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Verification',
          heading: 'The landlord has a question',
          bodyHtml: `Before approving the <strong>${escapeHtml(info.category)}</strong> job at ${escapeHtml(at)}, the landlord asked for more detail. Take a look and respond.`,
          ctaLabel: 'Respond now',
          ctaUrl,
        }),
      }
    case 'clarification_responded':
      return {
        subject: `Contractor responded: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Verification',
          heading: 'The contractor responded',
          bodyHtml: `The contractor replied to your question on the <strong>${escapeHtml(info.category)}</strong> job at ${escapeHtml(at)}.`,
          ctaLabel: 'View response',
          ctaUrl,
        }),
      }
    case 'contractor_cancelled':
      return {
        subject: `Contractor cancelled: ${info.category}`,
        html: baseTemplate({
          eyebrow: 'Job update',
          heading: 'The contractor had to cancel',
          bodyHtml: `The contractor selected for your <strong>${escapeHtml(info.category)}</strong> job at ${escapeHtml(at)} isn't able to do it anymore. The job is back open for sealed bidding, including your other existing bids.`,
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
    ctaLabel: 'View rent history',
    ctaUrl: `${SITE_URL}/landlord`,
  })
  return sendEmail({ to, subject: `Rent payment received: ${unitLabel}`, html })
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
    ctaLabel: 'View receipt',
    ctaUrl: `${SITE_URL}/receipts/job/${bidId}`,
  })
  return sendEmail({ to, subject: `Receipt: $${amount.toFixed(2)} paid for ${category}`, html })
}

export async function sendJobPaymentSentEmail({
  to,
  contractorName,
  amount,
  category,
  propertyLabel,
}: {
  to: string
  contractorName: string
  amount: number
  category: string
  propertyLabel: string
}) {
  const html = baseTemplate({
    eyebrow: 'Payment',
    heading: "You've been paid",
    bodyHtml: `Hi ${escapeHtml(contractorName)}, you were paid <strong>$${amount.toFixed(2)}</strong> for the <strong>${escapeHtml(category)}</strong> job at ${escapeHtml(propertyLabel)}. It's on its way to your bank account.`,
    ctaLabel: 'View job',
    ctaUrl: `${SITE_URL}/contractor`,
  })
  return sendEmail({ to, subject: `You've been paid: ${category}`, html })
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
