import { Resend } from 'resend'
import { isPreviewDeployment } from '@/lib/env'
import { SITE_URL } from '@/lib/site'
import { getAdminEmails } from '@/lib/adminAccess'

// Deliberately not imported from '@/lib/i18n' — that file is a 'use client'
// module (React hooks for the UI's live language switch), and this one runs
// server-side inside API routes and cron jobs. Same two-letter shape, kept
// as its own local type so this file never depends on a client bundle.
export type Lang = 'en' | 'es'

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

// Every admin-facing notification used to go to one hardcoded
// admin@prophandld.com inbox, disconnected from who's actually authorized
// as admin now that that's a real per-person list (admin_users). This
// sends to everyone on that list instead — one email per address rather
// than one email with everyone in the To: line, matching the pattern the
// rest of this app already uses for multi-recipient sends. Falls back to
// the old shared inbox if the list is somehow empty, so a notification
// never just silently goes nowhere.
async function sendToAdmins(subject: string, html: string) {
  const emails = await getAdminEmails()
  const recipients = emails.length > 0 ? emails : ['admin@prophandld.com']
  const results = await Promise.all(recipients.map((to) => sendEmail({ to, subject, html })))
  return results[0]
}

// Transactional email shell. One status pill, one headline, the facts that
// matter (what, where, when, how much), a progress tracker for job updates,
// and a single obvious action. `preheader` is the line Gmail and iPhone show
// beside the subject: without it they read out the first words of the email
// body, which is how "Job closed out Prophandld Job closed Job closed out"
// ended up in people's notification shade.
type EmailFact = { label: string; value: string }

const TRACKER_STEPS: Record<Lang, string[]> = {
  en: ['Reported', 'Bidding', 'Scheduled', 'In progress', 'Review', 'Paid'],
  es: ['Reportado', 'Ofertas', 'Programado', 'En progreso', 'Revisión', 'Pagado'],
}

// Shared fact-label dictionary. Call sites keep passing a plain English
// label string (unchanged, so nothing had to be restructured) and wrap it
// with fl(label, lang) instead — one lookup table instead of retranslating
// "Job"/"Where"/"Unit" a dozen times across every case below. Falls back to
// the English string itself if a label isn't in the table, so a label
// that's missed here degrades to English rather than rendering blank.
const FACT_LABELS: Record<string, string> = {
  'Job': 'Trabajo',
  'Where': 'Dónde',
  'Unit': 'Unidad',
  'When': 'Cuándo',
  'Urgency': 'Urgencia',
  'Emergency': 'Emergencia',
  'Bid': 'Oferta',
  'From': 'De',
  'Your price': 'Tu precio',
  'Price': 'Precio',
  'Current price': 'Precio actual',
  'Requested price': 'Precio solicitado',
  'Difference': 'Diferencia',
  'Contractor': 'Contratista',
  'Paid to': 'Pagado a',
  'For': 'Para',
  'New price': 'Nuevo precio',
  'Amount': 'Monto',
  'Amount due': 'Monto adeudado',
  'Late fee added': 'Cargo por atraso agregado',
  'Reason': 'Motivo',
  'Status': 'Estado',
}

function fl(label: string, lang: Lang): string {
  return lang === 'es' ? (FACT_LABELS[label] || label) : label
}

function trackerHtml(stage: number, lang: Lang) {
  const steps = TRACKER_STEPS[lang]
  const cells = steps.map((label, i) => {
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

const DEFAULT_FOOTER_TEXT: Record<Lang, string> = {
  en: 'Sent because you have an active Prophandld account.',
  es: 'Enviado porque tienes una cuenta activa de Prophandld.',
}

const NOTIFICATION_SETTINGS_LABEL: Record<Lang, string> = {
  en: 'Notification settings',
  es: 'Configuración de notificaciones',
}

// The English original plays on "handled" as both "managed" and the brand
// name Prophandld — a pun that doesn't carry over. This is the meaning it
// leaves behind (your property, taken care of), not a literal word-for-word
// pass.
const TAGLINE: Record<Lang, string> = {
  en: 'Your Property. Handled.',
  es: 'Tu propiedad. Resuelta.',
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
  footerText,
  lang,
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
  lang: Lang
}) {
  const resolvedFooterText = footerText ?? DEFAULT_FOOTER_TEXT[lang]
  const preview = preheader !== undefined ? escapeHtml(preheader) : heading.replace(/<[^>]+>/g, '')
  // Pad the hidden preview so mail apps don't pull the start of the body into it.
  const padding = '&zwnj;&nbsp;'.repeat(70)
  return `<!doctype html>
<html lang="${lang}">
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
                ${stage !== undefined ? trackerHtml(stage, lang) : ''}
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
                ${resolvedFooterText}<br />
                <a href="${SITE_URL}/profile" style="color:#8FA2BA;text-decoration:underline;">${NOTIFICATION_SETTINGS_LABEL[lang]}</a> · <a href="${SITE_URL}" style="color:#8FA2BA;text-decoration:none;">prophandld.com</a> · ${TAGLINE[lang]}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

// Sent before the recipient has an account, so there's no saved language
// preference to read yet — English only, by design, not an oversight.
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
    lang: 'en',
    eyebrow: 'Invite',
    heading: `${escapeHtml(landlordName)} invited you to Prophandld`,
    bodyHtml: `You've been added for <strong>${escapeHtml(unitLabel)}</strong>. Sign up with this same email address and you'll be linked to your unit automatically: maintenance requests, documents, and rent payments, all in one place.`,
    ctaLabel: 'Create your account',
    ctaUrl: `${SITE_URL}/signup`,
    footerText: `You're receiving this because ${escapeHtml(landlordName)} invited you to Prophandld.`,
  })
  return sendEmail({ to, subject: `${landlordName} invited you to Prophandld`, html })
}

// Same reasoning as sendRenterInviteEmail: pre-signup, no known preference.
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
    lang: 'en',
    eyebrow: 'Invite',
    heading: `${escapeHtml(landlordName)} invited you to Prophandld`,
    bodyHtml: `${escapeHtml(landlordName)} wants to work with you through Prophandld: sealed bidding, completely free to use, no platform fee, ever, and you get paid directly the moment a job's done.${note ? `<br /><br />Their note: "${escapeHtml(note)}"` : ''} Sign up as a contractor with this same email address to get started.`,
    ctaLabel: 'Create your account',
    ctaUrl: `${SITE_URL}/signup?role=contractor`,
    footerText: `You're receiving this because ${escapeHtml(landlordName)} invited you to Prophandld.`,
  })
  return sendEmail({ to, subject: `${landlordName} invited you to Prophandld`, html })
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Welcome-only: numbered gradient chips instead of a plain <ol>, so the one
// email that's supposed to feel like an arrival doesn't look identical to
// every job-update notification using the same shell. Table-based (not
// flex/grid) since that's still what actually renders consistently across
// mail clients — the same constraint trackerHtml/factsHtml above already
// work within.
function stepsHtml(items: string[]) {
  const rows = items
    .map(
      (item, i) => `<tr><td style="padding:0 0 ${i === items.length - 1 ? 0 : 14}px;" valign="top">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td valign="top" width="30" style="padding-right:11px;">
              <div style="width:22px;height:22px;border-radius:999px;background:linear-gradient(90deg,#0A7B7E,#12A5A9);color:#ffffff;font-size:12px;font-weight:700;text-align:center;line-height:22px;">${i + 1}</div>
            </td>
            <td style="color:#A9B7C8;font-size:14px;line-height:1.6;padding-top:2px;">${item}</td>
          </tr></table>
        </td></tr>`
    )
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;">${rows}</table>`
}

const WELCOME_CONTENT: Record<'landlord' | 'renter' | 'contractor', Record<Lang, { heading: string; bodyHtml: string; ctaLabel: string; ctaPath: string }>> = {
  landlord: {
    en: {
      heading: 'Welcome to Prophandld',
      bodyHtml: "Welcome aboard. Your properties just stopped living in a spreadsheet, a group text, and a shoebox of receipts, all at once." + stepsHtml([
        'Add a property, or pick up where you left off if you started one already',
        'Invite your tenants so they can report issues directly, no more texts to track down',
        "When something breaks, post it once. Contractors bid sealed, so you're never guessing what a fair price looks like",
      ]),
      ctaLabel: 'Go to your dashboard',
      ctaPath: '/landlord',
    },
    es: {
      heading: 'Bienvenido a Prophandld',
      bodyHtml: 'Bienvenido a bordo. Tus propiedades acaban de dejar de vivir en una hoja de cálculo, un chat grupal y una caja de recibos, todo a la vez.' + stepsHtml([
        'Agrega una propiedad, o continúa donde la dejaste si ya empezaste una',
        'Invita a tus inquilinos para que reporten problemas directamente, sin más mensajes de texto que rastrear',
        'Cuando algo se dañe, publícalo una vez. Los contratistas ofertan de forma sellada, así que nunca tendrás que adivinar cuál es un precio justo',
      ]),
      ctaLabel: 'Ir a tu panel',
      ctaPath: '/landlord',
    },
  },
  renter: {
    en: {
      heading: "You're in",
      bodyHtml: "Good to have you here. Maintenance, lease documents, and rent, all in one place instead of scattered across texts and drawers." + stepsHtml([
        "Report an issue in a few taps, with photos or video, no digging through old texts for your landlord's number",
        'See your lease documents anytime',
        'Pay rent right from here, no checks or cash',
      ]),
      ctaLabel: 'Go to your dashboard',
      ctaPath: '/renter',
    },
    es: {
      heading: 'Ya estás dentro',
      bodyHtml: 'Qué bueno tenerte aquí. Mantenimiento, documentos del contrato y renta, todo en un solo lugar en vez de repartido entre mensajes de texto y cajones.' + stepsHtml([
        'Reporta un problema en pocos toques, con fotos o video, sin buscar entre mensajes antiguos el número de tu arrendador',
        'Ve los documentos de tu contrato en cualquier momento',
        'Paga la renta directamente desde aquí, sin cheques ni efectivo',
      ]),
      ctaLabel: 'Ir a tu panel',
      ctaPath: '/renter',
    },
  },
  contractor: {
    en: {
      heading: 'Welcome to Prophandld',
      bodyHtml: "Welcome aboard. Real jobs near you, sealed bids, and you get paid the moment a landlord confirms the work's done, no lead fees, no cut, ever." + stepsHtml([
        'Set your service area and trades in Settings, so the right jobs find you',
        'Add your license and insurance for a "Verified" badge landlords can see',
        "Bid sealed on real jobs near you, you're never guessing what to quote",
      ]),
      ctaLabel: 'Go to your dashboard',
      ctaPath: '/contractor',
    },
    es: {
      heading: 'Bienvenido a Prophandld',
      bodyHtml: 'Bienvenido a bordo. Trabajos reales cerca de ti, ofertas selladas, y te pagan en el momento en que un arrendador confirma que el trabajo está terminado, sin costo por cliente potencial, sin comisión, nunca.' + stepsHtml([
        'Configura tu área de servicio y oficios en Ajustes, para que los trabajos correctos te encuentren',
        'Agrega tu licencia y seguro para obtener una insignia de "Verificado" que los propietarios pueden ver',
        'Oferta de forma sellada en trabajos reales cerca de ti, nunca tendrás que adivinar cuánto cotizar',
      ]),
      ctaLabel: 'Ir a tu panel',
      ctaPath: '/contractor',
    },
  },
}

// Sent once, right when an account first goes from "confirmed" to actually
// signed in — not on every login. See the auto-detected-session branch in
// /login, the one place this fires from.
export async function sendWelcomeEmail({
  to,
  name,
  role,
  lang = 'en',
}: {
  to: string
  name?: string | null
  role: 'landlord' | 'renter' | 'contractor'
  lang?: Lang
}) {
  const content = WELCOME_CONTENT[role][lang]
  const firstName = name?.trim().split(' ')[0]
  const html = baseTemplate({
    lang,
    eyebrow: lang === 'es' ? 'Bienvenida' : 'Welcome',
    heading: firstName ? (lang === 'es' ? `Bienvenido, ${escapeHtml(firstName)}` : `Welcome, ${escapeHtml(firstName)}`) : content.heading,
    bodyHtml: content.bodyHtml,
    ctaLabel: content.ctaLabel,
    ctaUrl: `${SITE_URL}${content.ctaPath}`,
    footerText: lang === 'es' ? 'Enviado una vez, la primera vez que iniciaste sesión.' : 'Sent once, the first time you signed in.',
  })
  return sendEmail({ to, subject: content.heading, html })
}

// Internal, to the Prophandld team inbox — always English.
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
    lang: 'en',
    eyebrow: 'Verification',
    heading: 'A credential is waiting for review',
    bodyHtml: `<strong>${escapeHtml(contractorName)}</strong> (${escapeHtml(contractorEmail)}) submitted <strong>${escapeHtml(requirementName)}</strong>, issued by ${escapeHtml(issuer)}. Open it, check it against the official record, then approve or reject.`,
    ctaLabel: 'Review credential',
    ctaUrl: `${SITE_URL}/admin/contractors`,
  })
  return sendToAdmins(`Credential to review: ${requirementName} (${contractorName})`, html)
}

export type CredentialExpiryItem = { name: string; expiry: string; stage: 1 | 2 | 3 }

// stage 1 = within 30 days, 2 = within 7 days, 3 = expired.
export async function sendCredentialExpiryEmail({
  to,
  contractorName,
  items,
  lang = 'en',
}: {
  to: string
  contractorName: string
  items: CredentialExpiryItem[]
  lang?: Lang
}) {
  const anyExpired = items.some((i) => i.stage === 3)
  const locale = lang === 'es' ? 'es-ES' : 'en-US'
  // One fact row per credential, same styled table every other list-like
  // email in the app already uses — this used to be a bare <ul>, visually
  // out of step with everything around it.
  const credentialFacts: EmailFact[] = items.map((i) => {
    const date = new Date(i.expiry + 'T00:00:00').toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' })
    const when = lang === 'es'
      ? (i.stage === 3 ? `Venció el ${date}` : `Vence el ${date}`)
      : (i.stage === 3 ? `Expired ${date}` : `Expires ${date}`)
    return { label: i.name, value: when }
  })
  const html = baseTemplate({
    lang,
    eyebrow: lang === 'es' ? (anyExpired ? 'Vencido' : 'Renovación') : (anyExpired ? 'Expired' : 'Renewal'),
    heading: lang === 'es'
      ? (anyExpired ? 'Una credencial de tu perfil venció' : 'Una credencial de tu perfil vence pronto')
      : (anyExpired ? 'A credential on your profile has expired' : 'A credential on your profile is expiring soon'),
    bodyHtml: lang === 'es'
      ? `Hola ${escapeHtml(contractorName)}, ${
          anyExpired
            ? 'los arrendadores ya no ven las credenciales vencidas junto a tus ofertas. Sube la renovación y la revisaremos.'
            : 'sube la renovación antes de que venza para que los arrendadores sigan viéndola junto a tus ofertas.'
        }`
      : `Hi ${escapeHtml(contractorName)}, ${
          anyExpired
            ? "landlords no longer see expired credentials next to your bids. Upload the renewal and we'll review it."
            : 'upload the renewal before it lapses so landlords keep seeing it next to your bids.'
        }`,
    preheader: items.length === 1
      ? `${items[0].name} — ${lang === 'es' ? (items[0].stage === 3 ? 'venció' : 'vence pronto') : (items[0].stage === 3 ? 'expired' : 'expiring soon')}`
      : lang === 'es' ? `${items.length} credenciales necesitan atención` : `${items.length} credentials need attention`,
    facts: credentialFacts,
    ctaLabel: lang === 'es' ? 'Actualizar credenciales' : 'Update credentials',
    ctaUrl: `${SITE_URL}/contractor/settings`,
    footerText: lang === 'es' ? 'Enviado porque tienes credenciales registradas en Prophandld.' : 'Sent because you have credentials on file with Prophandld.',
  })
  return sendEmail({
    to,
    subject: lang === 'es'
      ? (anyExpired ? 'Una credencial de tu perfil de Prophandld venció' : 'Una credencial de tu perfil de Prophandld vence pronto')
      : (anyExpired ? 'A credential on your Prophandld profile has expired' : 'A credential on your Prophandld profile is expiring soon'),
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
  // Set only for schedule_proposed/schedule_confirmed, when the date being
  // proposed or confirmed is close enough to count as a late change (see
  // isLateReschedule in scheduleWindows.ts) — makes that one push urgent so
  // a last-minute change never quietly sits unread.
  isLateReschedule?: boolean
}

function jobLocation(info: NotifyJobInfo) {
  return [info.address, info.city].filter(Boolean).join(', ') || 'your property'
}

function money(value: number) {
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`
}

// Categories are stored lowercase ("plumbing"), which reads fine tucked
// into the middle of a sentence but looks like a typo as the very first
// word of a push notification title — the one place in pushCopy() that
// happens is job_completed's non-contractor title.
function capFirst(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

// --- Push and SMS copy stays English-only for now (not part of this pass —
// only the email templates below were asked for). Tracked as a deliberate
// follow-up, not an oversight: the plumbing here (NotifyJobInfo, forRole)
// is shared with the email builder below, but pushCopy/buildPushMessage/
// buildSmsMessage take no lang parameter and never will until that's
// explicitly asked for. ---

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
        body: `${info.contractorName ? `${info.contractorName} · ` : ''}${where}.`,
      }
    case 'contractor_selected':
      return { title: `You got the ${cat} job`, body: `${where}. Tap to set a time.` }
    case 'schedule_proposed':
      return {
        title: info.isLateReschedule
          ? `Urgent: last-minute time change${info.when ? ` · ${info.when}` : ''}`
          : info.when ? `Time proposed: ${info.when}` : 'New time proposed',
        body: info.isLateReschedule
          ? `${cat} · ${where}. This is close to the current date, please check as soon as you can.`
          : `${cat} · ${where}. Tap to confirm or suggest another.`,
      }
    case 'schedule_confirmed':
      return {
        title: info.isLateReschedule
          ? `Urgent: confirmed for${info.when ? ` ${info.when}` : ' a new time'}, very soon`
          : info.when ? `Confirmed: ${info.when}` : 'Visit confirmed',
        body: `${cat} · ${where}.`,
      }
    case 'job_pending_review':
      return { title: `${who} finished the ${cat} work`, body: `${where}. Review and approve. It auto-approves in 3 days.` }
    case 'job_completed': {
      const paidPush = info.paymentStatus === 'paid'
      return {
        title: role === 'contractor' ? `Work approved: ${cat}` : `${capFirst(cat)} repair closed`,
        body:
          role === 'contractor'
            ? paidPush
              ? `${where}. Paid, check Earnings for your receipt.`
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
      return { title: `${who} replied`, body: `${cat} · ${where}.` }
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
    // than batch for battery savings — reserved for jobs flagged emergency,
    // and separately for a schedule change proposed or confirmed close
    // enough to the date that it counts as a late change (see
    // isLateReschedule in scheduleWindows.ts).
    urgent:
      ((type === 'job_reported' || type === 'job_open') && !!info.isEmergency) ||
      ((type === 'schedule_proposed' || type === 'schedule_confirmed') && !!info.isLateReschedule),
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

// Was hardcoded to build its title as if every recipient were the
// landlord — harmless today only because none of SMS_ENABLED_TYPES
// happens to put a price in its pushCopy title, not because it was
// actually safe by design. A future SMS-enabled type with a dollar amount
// in its title would otherwise leak it to a renter, who forRole() exists
// specifically to keep prices away from. Now takes the real recipient's
// role, same as every other copy-building function here does.
export function buildSmsMessage(type: NotifyType, role: NotifyRole, info: NotifyJobInfo) {
  const { title } = pushCopy(type, role, info)
  return `Prophandld: ${title}. ${info.category} at ${jobLocation(info)}.`
}

export function buildNotificationEmail(type: NotifyType, role: NotifyRole, rawInfo: NotifyJobInfo, lang: Lang = 'en') {
  const info = forRole(role, rawInfo)
  const ctaUrl = `${SITE_URL}/${role}/jobs/${info.jobId}`
  const cat = escapeHtml(info.category)
  const at = escapeHtml(jobLocation(info))
  const who = info.contractorName ? escapeHtml(info.contractorName) : (lang === 'es' ? 'El contratista' : 'The contractor')
  const jobFact: EmailFact = { label: fl('Job', lang), value: info.category }
  const whereFact: EmailFact = { label: fl('Where', lang), value: jobLocation(info) }
  const unitFact: EmailFact | null = info.unit ? { label: fl('Unit', lang), value: info.unit } : null
  const whenFact: EmailFact | null = info.when ? { label: fl('When', lang), value: info.when } : null
  const compact = (list: Array<EmailFact | null | false | undefined>) => list.filter((f): f is EmailFact => !!f)

  switch (type) {
    case 'job_open':
      return lang === 'es' ? {
        subject: `${info.isEmergency ? 'Emergencia: ' : ''}Nuevo trabajo de ${info.category} cerca de ti`,
        html: baseTemplate({
          lang,
          eyebrow: info.isEmergency ? 'Trabajo de emergencia' : 'Nuevo trabajo cerca de ti',
          heading: `Trabajo de ${cat} abierto para ofertas`,
          bodyHtml: `Un arrendador cerca de ti acaba de abrir este trabajo para ofertas${info.isEmergency ? ' y lo marcó como <strong>emergencia</strong>' : ''}. Tu oferta es sellada: otros contratistas no pueden verla.`,
          preheader: `${info.city || jobLocation(info)}. Ofertas selladas, solo el arrendador ve tu precio.`,
          stage: 1,
          facts: compact([jobFact, whereFact, unitFact, info.isEmergency ? { label: fl('Urgency', lang), value: fl('Emergency', lang) } : null]),
          ctaLabel: 'Ver trabajo y ofertar',
          ctaUrl: `${SITE_URL}/contractor/jobs/${info.jobId}/bid`,
        }),
      } : {
        subject: `${info.isEmergency ? 'Emergency: ' : ''}New ${info.category} job near you`,
        html: baseTemplate({
          lang,
          eyebrow: info.isEmergency ? 'Emergency job' : 'New job near you',
          heading: `${cat} job open for bids`,
          bodyHtml: `A landlord near you just opened this job for bidding${info.isEmergency ? ' and marked it as an <strong>emergency</strong>' : ''}. Your bid is sealed: other contractors can't see it.`,
          preheader: `${info.city || jobLocation(info)}. Sealed bidding, only the landlord sees your price.`,
          stage: 1,
          facts: compact([jobFact, whereFact, unitFact, info.isEmergency ? { label: fl('Urgency', lang), value: 'Emergency' } : null]),
          ctaLabel: 'View job and bid',
          ctaUrl: `${SITE_URL}/contractor/jobs/${info.jobId}/bid`,
        }),
      }
    case 'job_reported':
      return lang === 'es' ? {
        subject: `${info.isEmergency ? 'Emergencia: ' : ''}Nuevo problema de ${info.category} en ${info.address || 'tu propiedad'}`,
        html: baseTemplate({
          lang,
          eyebrow: info.isEmergency ? 'Emergencia' : 'Nuevo problema',
          heading: 'Un inquilino reportó un problema',
          bodyHtml: `Tu inquilino reportó un problema de <strong>${cat}</strong>. Reconócelo para abrirlo a ofertas, o recházalo si no es necesario.`,
          preheader: `${jobLocation(info)}. Reconócelo para empezar a recibir ofertas.`,
          stage: 0,
          facts: compact([jobFact, whereFact, unitFact, info.isEmergency ? { label: fl('Urgency', lang), value: fl('Emergency', lang) } : null]),
          ctaLabel: 'Revisar el problema',
          ctaUrl,
        }),
      } : {
        subject: `${info.isEmergency ? 'Emergency: ' : ''}New ${info.category} issue at ${info.address || 'your property'}`,
        html: baseTemplate({
          lang,
          eyebrow: info.isEmergency ? 'Emergency' : 'New issue',
          heading: 'A tenant reported an issue',
          bodyHtml: `Your tenant reported a <strong>${cat}</strong> issue. Acknowledge it to open the job for bids, or decline it if it isn't needed.`,
          preheader: `${jobLocation(info)}. Acknowledge it to start getting bids.`,
          stage: 0,
          facts: compact([jobFact, whereFact, unitFact, info.isEmergency ? { label: fl('Urgency', lang), value: 'Emergency' } : null]),
          ctaLabel: 'Review the issue',
          ctaUrl,
        }),
      }
    case 'bid_received':
      return lang === 'es' ? {
        subject: info.amount != null ? `Nueva oferta: ${money(info.amount)} para tu trabajo de ${info.category}` : `Nueva oferta para tu trabajo de ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: 'Nueva oferta',
          heading: info.amount != null ? `Nueva oferta: ${money(info.amount)}` : 'Recibiste una nueva oferta',
          bodyHtml: `${info.contractorName ? `<strong>${who}</strong> envió` : 'Un contratista envió'} una oferta sellada para tu trabajo de <strong>${cat}</strong>. Compara todas las ofertas y elige a quién quieres.`,
          preheader: `${info.contractorName ? `${info.contractorName} · ` : ''}${jobLocation(info)}`,
          stage: 1,
          facts: compact([
            info.amount != null && { label: fl('Bid', lang), value: money(info.amount) },
            info.contractorName ? { label: fl('From', lang), value: info.contractorName } : null,
            jobFact,
            whereFact, unitFact,
          ]),
          ctaLabel: 'Comparar ofertas',
          ctaUrl,
          note: 'Las ofertas son selladas: los contratistas no pueden ver los precios de los demás.',
        }),
      } : {
        subject: info.amount != null ? `New bid: ${money(info.amount)} on your ${info.category} job` : `New bid on your ${info.category} job`,
        html: baseTemplate({
          lang,
          eyebrow: 'New bid',
          heading: info.amount != null ? `New bid: ${money(info.amount)}` : 'You received a new bid',
          bodyHtml: `${info.contractorName ? `<strong>${who}</strong> submitted` : 'A contractor submitted'} a sealed bid on your <strong>${cat}</strong> job. Compare all bids side by side and pick who you want.`,
          preheader: `${info.contractorName ? `${info.contractorName} · ` : ''}${jobLocation(info)}`,
          stage: 1,
          facts: compact([
            info.amount != null && { label: fl('Bid', lang), value: money(info.amount) },
            info.contractorName ? { label: fl('From', lang), value: info.contractorName } : null,
            jobFact,
            whereFact, unitFact,
          ]),
          ctaLabel: 'Compare bids',
          ctaUrl,
          note: 'Bids are sealed: contractors can\'t see each other\'s prices.',
        }),
      }
    case 'contractor_selected':
      return lang === 'es' ? {
        subject: `Obtuviste el trabajo de ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: 'Fuiste seleccionado',
          heading: 'Obtuviste el trabajo',
          bodyHtml: `El arrendador eligió tu oferta para un trabajo de <strong>${cat}</strong>. Siguiente paso: acuerda un horario que le funcione al inquilino.`,
          preheader: `${jobLocation(info)}. Toca para elegir un horario.`,
          stage: 2,
          facts: compact([jobFact, whereFact, unitFact, info.amount != null && { label: fl('Your price', lang), value: money(info.amount) }]),
          ctaLabel: 'Elegir un horario',
          ctaUrl,
        }),
      } : {
        subject: `You got the ${info.category} job`,
        html: baseTemplate({
          lang,
          eyebrow: 'You were selected',
          heading: 'You got the job',
          bodyHtml: `The landlord chose your bid for a <strong>${cat}</strong> job. Next step: agree on a time that works for the tenant.`,
          preheader: `${jobLocation(info)}. Tap to set a time.`,
          stage: 2,
          facts: compact([jobFact, whereFact, unitFact, info.amount != null && { label: fl('Your price', lang), value: money(info.amount) }]),
          ctaLabel: 'Set a time',
          ctaUrl,
        }),
      }
    case 'schedule_proposed':
      return lang === 'es' ? {
        subject: info.isLateReschedule
          ? `Urgente, cambio de último momento${info.when ? `: ${info.when}` : ''}`
          : info.when ? `Horario propuesto: ${info.when}` : `Nuevo horario propuesto: ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: info.isLateReschedule ? 'Cambio urgente' : 'Programación',
          heading: info.when ? `Visita propuesta para ${escapeHtml(info.when)}` : 'Se propuso un nuevo horario',
          bodyHtml: `${info.isLateReschedule ? '<strong>Este cambio es muy cercano a la fecha actual.</strong> ' : ''}Se propuso una visita para el trabajo de <strong>${cat}</strong>. Confírmala, o sugiere un horario que te convenga más.`,
          preheader: `${info.when ? `${info.when}. ` : ''}Confírmalo o sugiere otro horario.`,
          stage: 2,
          facts: compact([whenFact, jobFact, whereFact, unitFact]),
          ctaLabel: 'Confirmar o cambiar',
          ctaUrl,
        }),
      } : {
        subject: info.isLateReschedule
          ? `Urgent, last-minute change${info.when ? `: ${info.when}` : ''}`
          : info.when ? `Time proposed: ${info.when}` : `New time proposed: ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: info.isLateReschedule ? 'Urgent change' : 'Scheduling',
          heading: info.when ? `Visit proposed for ${escapeHtml(info.when)}` : 'A new time was proposed',
          bodyHtml: `${info.isLateReschedule ? '<strong>This change is very close to the current date.</strong> ' : ''}A visit for the <strong>${cat}</strong> job was proposed. Confirm it, or suggest a time that suits you better.`,
          preheader: `${info.when ? `${info.when}. ` : ''}Confirm it or suggest another time.`,
          stage: 2,
          facts: compact([whenFact, jobFact, whereFact, unitFact]),
          ctaLabel: 'Confirm or change',
          ctaUrl,
        }),
      }
    case 'schedule_confirmed':
      return lang === 'es' ? {
        subject: info.isLateReschedule
          ? `Confirmado, muy pronto${info.when ? `: ${info.when}` : ''}`
          : info.when ? `Confirmado: ${info.when}` : `Visita confirmada: ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: info.isLateReschedule ? 'Confirmado, muy pronto' : 'Confirmado',
          heading: info.when ? `Visita confirmada para ${escapeHtml(info.when)}` : 'Visita confirmada',
          bodyHtml: `Todos acordaron un horario para el trabajo de <strong>${cat}</strong>. Ya está en el calendario.`,
          preheader: `${info.when ? `${info.when}. ` : ''}${jobLocation(info)}`,
          stage: 3,
          facts: compact([whenFact, jobFact, whereFact, unitFact]),
          ctaLabel: 'Ver trabajo',
          ctaUrl,
          note: '¿Necesitas cambiarlo? Abre el trabajo y propón un nuevo horario.',
        }),
      } : {
        subject: info.isLateReschedule
          ? `Confirmed, very soon${info.when ? `: ${info.when}` : ''}`
          : info.when ? `Confirmed: ${info.when}` : `Visit confirmed: ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: info.isLateReschedule ? 'Confirmed, very soon' : 'Confirmed',
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
      return lang === 'es' ? {
        subject: `${info.contractorName || 'Tu contratista'} terminó el trabajo de ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: 'Necesita tu revisión',
          heading: 'El trabajo está terminado',
          bodyHtml: `${info.contractorName ? `<strong>${who}</strong> marcó` : 'El contratista marcó'} el trabajo de <strong>${cat}</strong> como completo. Revisa las fotos de antes y después, luego aprueba.`,
          preheader: `Revisa las fotos y aprueba. Se aprueba automáticamente en 3 días.`,
          stage: 4,
          facts: compact([
            info.contractorName ? { label: fl('Contractor', lang), value: info.contractorName } : null,
            info.amount != null && { label: fl('Price', lang), value: money(info.amount) },
            jobFact,
            whereFact, unitFact,
          ]),
          ctaLabel: 'Revisar y aprobar',
          ctaUrl,
          note: 'Si no respondes dentro de 3 días, el trabajo se aprueba automáticamente.',
        }),
      } : {
        subject: `${info.contractorName || 'Your contractor'} finished the ${info.category} work`,
        html: baseTemplate({
          lang,
          eyebrow: 'Your review needed',
          heading: 'The work is finished',
          bodyHtml: `${info.contractorName ? `<strong>${who}</strong> marked` : 'The contractor marked'} the <strong>${cat}</strong> job as complete. Check the before and after photos, then approve.`,
          preheader: `Review the photos and approve. It auto-approves in 3 days.`,
          stage: 4,
          facts: compact([
            info.contractorName ? { label: fl('Contractor', lang), value: info.contractorName } : null,
            info.amount != null && { label: fl('Price', lang), value: money(info.amount) },
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
      if (lang === 'es') {
        const contractorHeading = paid ? 'Tu trabajo fue aprobado y pagado' : 'Tu trabajo fue aprobado'
        const contractorBody = paid
          ? `El arrendador aprobó tu trabajo de <strong>${cat}</strong> en ${at}, y el pago está en camino. Revisa Ganancias para el recibo.`
          : processing
            ? `El arrendador aprobó tu trabajo de <strong>${cat}</strong> en ${at}. El pago comenzó y se está procesando, eso normalmente toma de 1 a 3 días hábiles.`
            : `El arrendador aprobó tu trabajo de <strong>${cat}</strong> en ${at}. El pago es lo siguiente, te avisaremos por correo en cuanto se envíe.`
        return {
          subject: `Trabajo cerrado: ${info.category}`,
          html: baseTemplate({
            lang,
            eyebrow: 'Trabajo cerrado',
            heading: role === 'contractor' ? contractorHeading : 'La reparación está terminada',
            bodyHtml: role === 'contractor' ? contractorBody : `La reparación de <strong>${cat}</strong> en ${at} está terminada y cerrada. Gracias por reportarla.`,
            preheader:
              role === 'contractor'
                ? paid
                  ? 'Aprobado y pagado. Revisa Ganancias para tu recibo.'
                  : 'Aprobado. El pago está en camino, revisa Ganancias para novedades.'
                : `${jobLocation(info)}. Todo listo.`,
            stage: role === 'contractor' && !paid ? 4 : 5,
            facts: compact([jobFact, whereFact, unitFact, role === 'contractor' && info.amount != null && { label: fl('Price', lang), value: money(info.amount) }]),
            ctaLabel: role === 'contractor' ? 'Ver ganancias' : 'Ver trabajo',
            ctaUrl: role === 'contractor' ? `${SITE_URL}/contractor` : ctaUrl,
          }),
        }
      }
      const contractorHeading = paid ? 'Your work was approved and paid' : 'Your work was approved'
      const contractorBody = paid
        ? `The landlord approved your work on the <strong>${cat}</strong> job at ${at}, and payment is on its way. Check Earnings for the receipt.`
        : processing
          ? `The landlord approved your work on the <strong>${cat}</strong> job at ${at}. Payment has started and is clearing, that usually takes 1 to 3 business days.`
          : `The landlord approved your work on the <strong>${cat}</strong> job at ${at}. Payment is next, we'll email you the moment it's sent.`
      return {
        subject: `Job closed: ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: 'Job closed',
          heading: role === 'contractor' ? contractorHeading : 'The repair is finished',
          bodyHtml: role === 'contractor' ? contractorBody : `The <strong>${cat}</strong> repair at ${at} is finished and closed. Thanks for reporting it.`,
          preheader:
            role === 'contractor'
              ? paid
                ? 'Approved and paid. Check Earnings for your receipt.'
                : 'Approved. Payment is on its way, check Earnings for updates.'
              : `${jobLocation(info)}. All done.`,
          // The tracker's last step is "Paid" — only light it up as reached
          // once payment genuinely succeeded, otherwise stop one step short
          // at "Review" so the bar never claims something that hasn't happened.
          stage: role === 'contractor' && !paid ? 4 : 5,
          facts: compact([jobFact, whereFact, unitFact, role === 'contractor' && info.amount != null && { label: fl('Price', lang), value: money(info.amount) }]),
          ctaLabel: role === 'contractor' ? 'View earnings' : 'View job',
          ctaUrl: role === 'contractor' ? `${SITE_URL}/contractor` : ctaUrl,
        }),
      }
    }
    case 'job_declined':
      return lang === 'es' ? {
        subject: `Actualización sobre tu reporte de ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: 'Actualización de reporte',
          heading: 'Tu arrendador rechazó este reporte',
          bodyHtml: `Tu arrendador rechazó el reporte de <strong>${cat}</strong> en ${at}. Abre el trabajo para ver cualquier nota que haya dejado. Puedes escribirle desde ahí.`,
          preheader: `${jobLocation(info)}. Abre el trabajo para ver por qué.`,
          facts: compact([jobFact, whereFact, unitFact]),
          ctaLabel: 'Ver los detalles',
          ctaUrl,
        }),
      } : {
        subject: `Update on your ${info.category} report`,
        html: baseTemplate({
          lang,
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
      return lang === 'es' ? {
        subject:
          info.amount != null && info.requestedAmount != null
            ? `Cambio de precio: ${money(info.amount)} a ${money(info.requestedAmount)}`
            : `Cambio de precio solicitado: ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: 'Necesita tu decisión',
          heading: 'Se solicitó un cambio de precio',
          bodyHtml: `${info.contractorName ? `<strong>${who}</strong> está pidiendo` : 'El contratista está pidiendo'} cambiar el precio de tu trabajo de <strong>${cat}</strong>, con un desglose de mano de obra y materiales. Apruébalo o recházalo.`,
          preheader:
            info.amount != null && info.requestedAmount != null
              ? `De ${money(info.amount)} a ${money(info.requestedAmount)}. Toca para revisar el desglose.`
              : 'Toca para revisar el desglose.',
          stage: 3,
          facts: compact([
            info.amount != null && { label: fl('Current price', lang), value: money(info.amount) },
            info.requestedAmount != null && { label: fl('Requested price', lang), value: money(info.requestedAmount) },
            info.amount != null && info.requestedAmount != null && {
              label: fl('Difference', lang),
              value: `${info.requestedAmount >= info.amount ? '+' : '-'}${money(Math.abs(info.requestedAmount - info.amount))}`,
            },
            jobFact,
          ]),
          ctaLabel: 'Revisar la solicitud',
          ctaUrl,
        }),
      } : {
        subject:
          info.amount != null && info.requestedAmount != null
            ? `Price change: ${money(info.amount)} to ${money(info.requestedAmount)}`
            : `Price change requested: ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: 'Needs your decision',
          heading: 'A price change was requested',
          bodyHtml: `${info.contractorName ? `<strong>${who}</strong> is asking` : 'The contractor is asking'} to change the price on your <strong>${cat}</strong> job, with a labor and parts breakdown. Approve or decline it.`,
          preheader:
            info.amount != null && info.requestedAmount != null
              ? `From ${money(info.amount)} to ${money(info.requestedAmount)}. Tap to review the breakdown.`
              : 'Tap to review the breakdown.',
          stage: 3,
          facts: compact([
            info.amount != null && { label: fl('Current price', lang), value: money(info.amount) },
            info.requestedAmount != null && { label: fl('Requested price', lang), value: money(info.requestedAmount) },
            info.amount != null && info.requestedAmount != null && {
              label: fl('Difference', lang),
              value: `${info.requestedAmount >= info.amount ? '+' : '-'}${money(Math.abs(info.requestedAmount - info.amount))}`,
            },
            jobFact,
          ]),
          ctaLabel: 'Review the request',
          ctaUrl,
        }),
      }
    case 'price_change_approved':
      return lang === 'es' ? {
        subject: `Cambio de precio aprobado: ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: 'Aprobado',
          heading: 'Tu nuevo precio fue aprobado',
          bodyHtml: `El arrendador aprobó tu nuevo precio para el trabajo de <strong>${cat}</strong> en ${at}. Puedes continuar.`,
          preheader: info.amount != null ? `Nuevo precio: ${money(info.amount)}. Puedes continuar.` : 'Puedes continuar.',
          stage: 3,
          facts: compact([info.amount != null && { label: fl('New price', lang), value: money(info.amount) }, jobFact, whereFact, unitFact]),
          ctaLabel: 'Ver trabajo',
          ctaUrl,
        }),
      } : {
        subject: `Price change approved: ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: 'Approved',
          heading: 'Your new price was approved',
          bodyHtml: `The landlord approved your new price for the <strong>${cat}</strong> job at ${at}. You're clear to continue.`,
          preheader: info.amount != null ? `New price: ${money(info.amount)}. You can carry on.` : 'You can carry on.',
          stage: 3,
          facts: compact([info.amount != null && { label: fl('New price', lang), value: money(info.amount) }, jobFact, whereFact, unitFact]),
          ctaLabel: 'View job',
          ctaUrl,
        }),
      }
    case 'price_change_rejected':
      return lang === 'es' ? {
        subject: `Cambio de precio rechazado: ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: 'Rechazado',
          heading: 'Tu cambio de precio fue rechazado',
          bodyHtml: `El arrendador rechazó el nuevo precio para el trabajo de <strong>${cat}</strong> en ${at}. El precio original sigue vigente.`,
          preheader: info.amount != null ? `El precio original de ${money(info.amount)} se mantiene.` : 'El precio original se mantiene.',
          stage: 3,
          facts: compact([info.amount != null && { label: fl('Price', lang), value: money(info.amount) }, jobFact, whereFact, unitFact]),
          ctaLabel: 'Ver trabajo',
          ctaUrl,
        }),
      } : {
        subject: `Price change declined: ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: 'Declined',
          heading: 'Your price change was declined',
          bodyHtml: `The landlord declined the new price for the <strong>${cat}</strong> job at ${at}. The original price stays in effect.`,
          preheader: info.amount != null ? `The original price of ${money(info.amount)} stands.` : 'The original price stands.',
          stage: 3,
          facts: compact([info.amount != null && { label: fl('Price', lang), value: money(info.amount) }, jobFact, whereFact, unitFact]),
          ctaLabel: 'View job',
          ctaUrl,
        }),
      }
    case 'clarification_requested':
      return lang === 'es' ? {
        subject: `El arrendador tiene una pregunta: ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: 'Pregunta',
          heading: 'El arrendador tiene una pregunta',
          bodyHtml: `Antes de aprobar el trabajo de <strong>${cat}</strong> en ${at}, el arrendador pidió más detalles. Responde en el chat del trabajo.`,
          preheader: 'Responde en el chat del trabajo para que puedan aprobar.',
          stage: 4,
          facts: compact([jobFact, whereFact, unitFact]),
          ctaLabel: 'Responder ahora',
          ctaUrl,
        }),
      } : {
        subject: `The landlord has a question: ${info.category}`,
        html: baseTemplate({
          lang,
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
      return lang === 'es' ? {
        subject: `${info.contractorName || 'El contratista'} respondió: ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: 'Respuesta',
          heading: 'El contratista respondió',
          bodyHtml: `${info.contractorName ? `<strong>${who}</strong> respondió` : 'El contratista respondió'} a tu pregunta sobre el trabajo de <strong>${cat}</strong> en ${at}.`,
          preheader: 'Lee la respuesta y aprueba cuando estés listo.',
          stage: 4,
          facts: compact([jobFact, whereFact, unitFact]),
          ctaLabel: 'Ver respuesta',
          ctaUrl,
        }),
      } : {
        subject: `${info.contractorName || 'The contractor'} replied: ${info.category}`,
        html: baseTemplate({
          lang,
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
      return lang === 'es' ? {
        subject: `Contratista canceló: ${info.category}`,
        html: baseTemplate({
          lang,
          eyebrow: 'Actualización del trabajo',
          heading: 'El contratista tuvo que cancelar',
          bodyHtml:
            role === 'landlord'
              ? `El contratista de tu trabajo de <strong>${cat}</strong> en ${at} ya no puede hacerlo. El trabajo está abierto de nuevo para ofertas selladas, y se avisó a contratistas cercanos.`
              : `El contratista del trabajo de <strong>${cat}</strong> en ${at} ya no puede hacerlo. El arrendador está buscando un reemplazo. No se necesita nada de tu parte.`,
          preheader: role === 'landlord' ? 'Abierto de nuevo para ofertas. Se avisó a contratistas cercanos.' : 'El arrendador está buscando un reemplazo.',
          stage: 1,
          facts: compact([jobFact, whereFact, unitFact]),
          ctaLabel: 'Ver trabajo',
          ctaUrl,
        }),
      } : {
        subject: `Contractor cancelled: ${info.category}`,
        html: baseTemplate({
          lang,
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
  lang = 'en',
}: {
  to: string
  landlordName: string
  amount: number
  monthLabel: string
  unitLabel: string
  lang?: Lang
}) {
  const html = lang === 'es' ? baseTemplate({
    lang,
    eyebrow: 'Pago',
    heading: 'Pago de renta recibido',
    bodyHtml: `Hola ${escapeHtml(landlordName)}, un pago de renta de <strong>$${amount.toFixed(2)}</strong> por ${escapeHtml(monthLabel)} llegó para <strong>${escapeHtml(unitLabel)}</strong>. Ya está en camino a tu cuenta bancaria.`,
    preheader: `${monthLabel} · ${unitLabel}. En camino a tu cuenta bancaria.`,
    facts: [
      { label: fl('Amount', lang), value: `$${amount.toFixed(2)}` },
      { label: fl('For', lang), value: monthLabel },
      { label: fl('Unit', lang), value: unitLabel },
    ],
    ctaLabel: 'Ver historial de renta',
    ctaUrl: `${SITE_URL}/landlord`,
    note: 'Tu banco define la hora final de llegada.',
  }) : baseTemplate({
    lang,
    eyebrow: 'Payment',
    heading: 'Rent payment received',
    bodyHtml: `Hi ${escapeHtml(landlordName)}, a rent payment of <strong>$${amount.toFixed(2)}</strong> for ${escapeHtml(monthLabel)} came in for <strong>${escapeHtml(unitLabel)}</strong>. It's already on its way to your bank account.`,
    preheader: `${monthLabel} · ${unitLabel}. On its way to your bank account.`,
    facts: [
      { label: fl('Amount', lang), value: `$${amount.toFixed(2)}` },
      { label: fl('For', lang), value: monthLabel },
      { label: fl('Unit', lang), value: unitLabel },
    ],
    ctaLabel: 'View rent history',
    ctaUrl: `${SITE_URL}/landlord`,
    note: 'Your bank sets the final arrival time.',
  })
  return sendEmail({ to, subject: lang === 'es' ? `Renta recibida: $${amount.toFixed(2)} para ${unitLabel}` : `Rent received: $${amount.toFixed(2)} for ${unitLabel}`, html })
}

export async function sendChatMessageEmail({
  to,
  senderName,
  context,
  preview,
  ctaUrl,
  lang = 'en',
}: {
  to: string
  senderName: string
  context: string
  preview: string
  ctaUrl: string
  lang?: Lang
}) {
  const html = baseTemplate({
    lang,
    eyebrow: lang === 'es' ? 'Mensaje' : 'Message',
    heading: lang === 'es' ? `${escapeHtml(senderName)} te envió un mensaje` : `${escapeHtml(senderName)} sent you a message`,
    bodyHtml: `${escapeHtml(context)}<br /><br />"${escapeHtml(preview)}"`,
    preheader: preview,
    ctaLabel: lang === 'es' ? 'Abrir chat' : 'Open chat',
    ctaUrl,
    note: lang === 'es'
      ? 'Solo recibirás un correo por una serie de mensajes. Los nuevos siguen llegando en la app.'
      : 'You will only get one email for a run of messages. New ones keep arriving in the app.',
  })
  return sendEmail({ to, subject: `${senderName}: ${preview.length > 60 ? `${preview.slice(0, 57)}...` : preview}`, html })
}

export async function sendJobPaymentReceiptEmail({
  to,
  landlordName,
  contractorName,
  amount,
  fee = 0,
  category,
  propertyLabel,
  bidId,
  lang = 'en',
}: {
  to: string
  landlordName: string
  contractorName: string
  amount: number
  fee?: number
  category: string
  propertyLabel: string
  bidId: string
  lang?: Lang
}) {
  // `amount` is always what the contractor was actually paid — the
  // landlord's own total (if they paid by card and a processing-fee
  // surcharge applied) is amount + fee, shown as its own fact rather than
  // folded into "Amount" so the number the contractor was paid never
  // looks ambiguous on the landlord's own receipt.
  const total = amount + fee
  const esFacts: EmailFact[] = [
    { label: fl('Amount', lang), value: `$${amount.toFixed(2)}` },
    ...(fee > 0 ? [{ label: 'Cargo por procesamiento', value: `$${fee.toFixed(2)}` }, { label: 'Total cobrado', value: `$${total.toFixed(2)}` }] : []),
    { label: fl('Paid to', lang), value: contractorName },
    { label: fl('Job', lang), value: category },
    { label: fl('Where', lang), value: propertyLabel },
  ]
  const enFacts: EmailFact[] = [
    { label: fl('Amount', lang), value: `$${amount.toFixed(2)}` },
    ...(fee > 0 ? [{ label: 'Processing fee', value: `$${fee.toFixed(2)}` }, { label: 'Total charged', value: `$${total.toFixed(2)}` }] : []),
    { label: fl('Paid to', lang), value: contractorName },
    { label: fl('Job', lang), value: category },
    { label: fl('Where', lang), value: propertyLabel },
  ]
  const html = lang === 'es' ? baseTemplate({
    lang,
    eyebrow: 'Recibo',
    heading: 'Recibo de pago',
    bodyHtml: `Hola ${escapeHtml(landlordName)}, tu pago de <strong>$${total.toFixed(2)}</strong> a <strong>${escapeHtml(contractorName)}</strong> por el trabajo de <strong>${escapeHtml(category)}</strong> en ${escapeHtml(propertyLabel)} se procesó. Tu recibo está guardado en el trabajo para tus registros.`,
    preheader: `$${total.toFixed(2)} a ${contractorName} por ${category}.`,
    facts: esFacts,
    ctaLabel: 'Ver recibo',
    ctaUrl: `${SITE_URL}/receipts/job/${bidId}`,
  }) : baseTemplate({
    lang,
    eyebrow: 'Receipt',
    heading: 'Payment receipt',
    bodyHtml: `Hi ${escapeHtml(landlordName)}, your payment of <strong>$${total.toFixed(2)}</strong> to <strong>${escapeHtml(contractorName)}</strong> for the <strong>${escapeHtml(category)}</strong> job at ${escapeHtml(propertyLabel)} went through. Your receipt is saved on the job for your records.`,
    preheader: `$${total.toFixed(2)} to ${contractorName} for ${category}.`,
    facts: enFacts,
    ctaLabel: 'View receipt',
    ctaUrl: `${SITE_URL}/receipts/job/${bidId}`,
  })
  return sendEmail({ to, subject: lang === 'es' ? `Recibo: $${total.toFixed(2)} pagado por ${category}` : `Receipt: $${total.toFixed(2)} paid for ${category}`, html })
}

export async function sendJobAutoApprovedPayNowEmail({
  to,
  landlordName,
  contractorName,
  amount,
  category,
  propertyLabel,
  jobId,
  lang = 'en',
}: {
  to: string
  landlordName: string
  contractorName: string
  amount: number
  category: string
  propertyLabel: string
  jobId: string
  lang?: Lang
}) {
  const html = lang === 'es' ? baseTemplate({
    lang,
    eyebrow: 'Acción requerida',
    heading: 'Aprobamos este trabajo por ti',
    bodyHtml: `Hola ${escapeHtml(landlordName)}, nadie revisó el trabajo de <strong>${escapeHtml(category)}</strong> en ${escapeHtml(propertyLabel)} dentro de los 3 días desde que <strong>${escapeHtml(contractorName)}</strong> lo terminó, así que se aprobó automáticamente para que no se quedara esperando. A ${escapeHtml(contractorName)} todavía no se le ha pagado, esa parte nunca es automática.`,
    preheader: `${escapeHtml(contractorName)} está esperando $${amount.toFixed(2)}. Paga ahora para liberarlo.`,
    facts: [
      { label: fl('Amount due', lang), value: `$${amount.toFixed(2)}` },
      { label: fl('Contractor', lang), value: contractorName },
      { label: fl('Job', lang), value: category },
      { label: fl('Where', lang), value: propertyLabel },
    ],
    ctaLabel: 'Pagar ahora',
    ctaUrl: `${SITE_URL}/landlord/jobs/${jobId}`,
    note: 'Esto se aprobó solo porque nadie respondió en 3 días. Pagar al contratista todavía requiere un toque tuyo.',
  }) : baseTemplate({
    lang,
    eyebrow: 'Action needed',
    heading: 'We approved this job for you',
    bodyHtml: `Hi ${escapeHtml(landlordName)}, nobody reviewed the <strong>${escapeHtml(category)}</strong> job at ${escapeHtml(propertyLabel)} within 3 days of <strong>${escapeHtml(contractorName)}</strong> finishing it, so it was approved automatically so they aren't left waiting. ${escapeHtml(contractorName)} still hasn't been paid, that part is never automatic.`,
    preheader: `${escapeHtml(contractorName)} is waiting on $${amount.toFixed(2)}. Pay now to release it.`,
    facts: [
      { label: fl('Amount due', lang), value: `$${amount.toFixed(2)}` },
      { label: fl('Contractor', lang), value: contractorName },
      { label: fl('Job', lang), value: category },
      { label: fl('Where', lang), value: propertyLabel },
    ],
    ctaLabel: 'Pay now',
    ctaUrl: `${SITE_URL}/landlord/jobs/${jobId}`,
    note: 'This approved itself because nobody responded in 3 days. Paying the contractor still takes one tap from you.',
  })
  return sendEmail({ to, subject: lang === 'es' ? `Acción requerida: paga a ${contractorName} $${amount.toFixed(2)} por ${category}` : `Action needed: pay ${contractorName} $${amount.toFixed(2)} for ${category}`, html })
}

// One digest to the Prophandld inbox whenever the daily check auto-approves
// anything, so a person sees it the same day rather than a contractor
// discovering days later that nobody ever paid them. Internal, always English.
export async function sendAutoApprovalDigestAdminEmail({
  jobs,
}: {
  jobs: { category: string; propertyLabel: string; contractorName: string; amount: number; jobId: string }[]
}) {
  if (jobs.length === 0) return
  const rows = jobs
    .map((j) => `<li style="margin-bottom:6px;">${escapeHtml(j.category)} at ${escapeHtml(j.propertyLabel)}: ${escapeHtml(j.contractorName)} is owed $${j.amount.toFixed(2)}</li>`)
    .join('')
  const html = baseTemplate({
    lang: 'en',
    eyebrow: 'Auto-approved',
    heading: `${jobs.length} job${jobs.length === 1 ? '' : 's'} auto-approved today`,
    bodyHtml: `No landlord response within 3 days, so ${jobs.length === 1 ? 'this job was' : 'these were'} approved automatically and the landlord was emailed to pay. Nothing forces them to, worth a manual check if any stay unpaid.<ul style="margin:14px 0 0;padding-left:20px;color:#A9B7C8;font-size:14px;line-height:1.6;">${rows}</ul>`,
    preheader: `${jobs.length} landlord${jobs.length === 1 ? '' : 's'} emailed to pay. Nothing is guaranteed until they do.`,
    ctaLabel: 'Open admin jobs',
    ctaUrl: `${SITE_URL}/admin/jobs`,
  })
  return sendToAdmins(`${jobs.length} job(s) auto-approved, payment not guaranteed`, html)
}

// Sent once per dispute, the first time it's still open 3+ days after
// being raised — not a repeating daily nag, cron/stale-disputes guards
// that with stale_reminder_sent_at. A dispute pauses the whole job for
// everyone on it, so it sitting unnoticed is worse than most other
// "stuck" states this app already flags.
export async function sendStaleDisputesDigestEmail({
  disputes,
}: {
  disputes: { jobCategory: string; propertyLabel: string; raisedByRole: string; ageDays: number; disputeId: string }[]
}) {
  if (disputes.length === 0) return
  const rows = disputes
    .map((d) => `<li style="margin-bottom:6px;">${escapeHtml(d.jobCategory)} at ${escapeHtml(d.propertyLabel)}: raised by ${escapeHtml(d.raisedByRole)}, open ${d.ageDays} days</li>`)
    .join('')
  const html = baseTemplate({
    lang: 'en',
    eyebrow: 'Needs attention',
    heading: `${disputes.length} dispute${disputes.length === 1 ? ' has' : 's have'} been open 3+ days`,
    bodyHtml: `${disputes.length === 1 ? 'This dispute is' : 'These are'} still waiting on a resolution, and the job${disputes.length === 1 ? ' is' : 's are'} paused for everyone on it until then.<ul style="margin:14px 0 0;padding-left:20px;color:#A9B7C8;font-size:14px;line-height:1.6;">${rows}</ul>`,
    preheader: `${disputes.length} dispute${disputes.length === 1 ? '' : 's'} still open after 3+ days.`,
    ctaLabel: 'Review disputes',
    ctaUrl: `${SITE_URL}/admin/disputes`,
  })
  return sendToAdmins(`${disputes.length} dispute(s) open 3+ days, needs a look`, html)
}

export async function sendJobPaymentSentEmail({
  to,
  contractorName,
  amount,
  category,
  propertyLabel,
  bidId,
  lang = 'en',
}: {
  to: string
  contractorName: string
  amount: number
  category: string
  propertyLabel: string
  bidId: string
  lang?: Lang
}) {
  const html = lang === 'es' ? baseTemplate({
    lang,
    eyebrow: 'Pago',
    heading: 'Te pagaron',
    bodyHtml: `Hola ${escapeHtml(contractorName)}, te pagaron <strong>$${amount.toFixed(2)}</strong> por el trabajo de <strong>${escapeHtml(category)}</strong> en ${escapeHtml(propertyLabel)}. Está en camino a tu cuenta bancaria.`,
    preheader: `$${amount.toFixed(2)} por ${category}. En camino a tu cuenta bancaria.`,
    facts: [
      { label: fl('Amount', lang), value: `$${amount.toFixed(2)}` },
      { label: fl('Job', lang), value: category },
      { label: fl('Where', lang), value: propertyLabel },
    ],
    ctaLabel: 'Ver recibo de pago',
    ctaUrl: `${SITE_URL}/receipts/job/${bidId}`,
    note: 'Tu banco define la hora final de llegada. Todos tus pagos están en Ganancias.',
  }) : baseTemplate({
    lang,
    eyebrow: 'Payment',
    heading: "You've been paid",
    bodyHtml: `Hi ${escapeHtml(contractorName)}, you were paid <strong>$${amount.toFixed(2)}</strong> for the <strong>${escapeHtml(category)}</strong> job at ${escapeHtml(propertyLabel)}. It's on its way to your bank account.`,
    preheader: `$${amount.toFixed(2)} for ${category}. On its way to your bank account.`,
    facts: [
      { label: fl('Amount', lang), value: `$${amount.toFixed(2)}` },
      { label: fl('Job', lang), value: category },
      { label: fl('Where', lang), value: propertyLabel },
    ],
    ctaLabel: 'View payment receipt',
    ctaUrl: `${SITE_URL}/receipts/job/${bidId}`,
    note: 'Your bank sets the final arrival time. All your payments are under Earnings.',
  })
  return sendEmail({ to, subject: lang === 'es' ? `Te pagaron $${amount.toFixed(2)}: ${category}` : `You've been paid $${amount.toFixed(2)}: ${category}`, html })
}

export async function sendContractorVerificationDecisionEmail({
  to,
  contractorName,
  approved,
  notes,
  lang = 'en',
}: {
  to: string
  contractorName: string
  approved: boolean
  notes?: string | null
  lang?: Lang
}) {
  const html = lang === 'es' ? baseTemplate({
    lang,
    eyebrow: 'Verificación',
    heading: approved ? 'Estás verificado ✓' : 'Actualización de verificación',
    bodyHtml: approved
      ? `Hola ${escapeHtml(contractorName)}, tu licencia y seguro fueron revisados y aprobados. Los arrendadores ahora verán una insignia de "Verificado" en tus ofertas.`
      : `Hola ${escapeHtml(contractorName)}, tu solicitud de verificación no fue aprobada.${notes ? ` Nota de nuestro equipo: ${escapeHtml(notes)}` : ''} Puedes actualizar tus documentos y volver a enviarlos cuando quieras.`,
    ctaLabel: 'Ver configuración',
    ctaUrl: `${SITE_URL}/contractor/settings`,
  }) : baseTemplate({
    lang,
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
    subject: lang === 'es' ? (approved ? 'Estás verificado en Prophandld' : 'Actualización de tu verificación en Prophandld') : (approved ? "You're verified on Prophandld" : 'Update on your Prophandld verification'),
    html,
  })
}

// Internal, always English.
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
    lang: 'en',
    eyebrow: 'Dispute',
    heading: 'A dispute was raised',
    bodyHtml: `A ${escapeHtml(raisedByRole)} raised a dispute on the <strong>${escapeHtml(jobCategory)}</strong> job at ${escapeHtml(propertyLabel)}.<br /><br />"${escapeHtml(reason)}"`,
    ctaLabel: 'Review dispute',
    ctaUrl: `${SITE_URL}/admin/disputes`,
  })
  return sendToAdmins(`Dispute raised: ${jobCategory} (job ${jobId.slice(0, 8)})`, html)
}

const DISPUTE_OUTCOME_LABEL: Record<Lang, Record<string, string>> = {
  en: {
    landlord: 'in favor of the landlord',
    contractor: 'in favor of the contractor',
  },
  es: {
    landlord: 'a favor del arrendador',
    contractor: 'a favor del contratista',
  },
}

export async function sendDisputeResolvedEmail({
  to,
  jobCategory,
  propertyLabel,
  outcome,
  resolutionNotes,
  role,
  jobId,
  lang = 'en',
}: {
  to: string
  jobCategory: string
  propertyLabel: string
  outcome: string
  resolutionNotes?: string | null
  role: 'landlord' | 'renter' | 'contractor'
  jobId: string
  lang?: Lang
}) {
  const outcomeLabel = DISPUTE_OUTCOME_LABEL[lang][outcome] || (lang === 'es' ? 'con un resultado neutral' : 'with a neutral outcome')
  const html = lang === 'es' ? baseTemplate({
    lang,
    eyebrow: 'Disputa',
    heading: 'Tu disputa fue resuelta',
    bodyHtml: `La disputa sobre el trabajo de <strong>${escapeHtml(jobCategory)}</strong> en ${escapeHtml(propertyLabel)} se resolvió ${escapeHtml(outcomeLabel)}.${resolutionNotes ? `<br /><br />"${escapeHtml(resolutionNotes)}"` : ''}`,
    ctaLabel: 'Ver trabajo',
    ctaUrl: `${SITE_URL}/${role}/jobs/${jobId}`,
  }) : baseTemplate({
    lang,
    eyebrow: 'Dispute',
    heading: 'Your dispute was resolved',
    bodyHtml: `The dispute on the <strong>${escapeHtml(jobCategory)}</strong> job at ${escapeHtml(propertyLabel)} has been resolved ${escapeHtml(outcomeLabel)}.${resolutionNotes ? `<br /><br />"${escapeHtml(resolutionNotes)}"` : ''}`,
    ctaLabel: 'View job',
    ctaUrl: `${SITE_URL}/${role}/jobs/${jobId}`,
  })
  return sendEmail({ to, subject: lang === 'es' ? `Disputa resuelta: ${jobCategory}` : `Dispute resolved: ${jobCategory}`, html })
}

export async function sendCreditCardRejectedEmail({
  to,
  renterName,
  amount,
  unitLabel,
  lang = 'en',
}: {
  to: string
  renterName: string
  // Both optional so this degrades gracefully if a future call site doesn't
  // have them yet — but the real call site (the Stripe webhook) does, since
  // the rejected paymentIntent already carries its own charged amount.
  amount?: number | null
  unitLabel?: string | null
  lang?: Lang
}) {
  const amountFact: EmailFact | null = amount != null ? { label: fl('Amount', lang), value: `$${amount.toFixed(2)}` } : null
  const unitFact: EmailFact | null = unitLabel ? { label: fl('Unit', lang), value: unitLabel } : null
  const html = lang === 'es' ? baseTemplate({
    lang,
    eyebrow: 'Pago',
    heading: 'Pago reembolsado',
    bodyHtml: `Hola ${escapeHtml(renterName)}, la renta solo se puede pagar con <strong>tarjeta de débito o cuenta bancaria</strong>. No se aceptan tarjetas de crédito. Tu pago fue reembolsado por completo y la renta sigue pendiente. Por favor intenta de nuevo con una tarjeta de débito o transferencia bancaria.`,
    preheader: 'Tu pago fue reembolsado por completo. La renta sigue pendiente.',
    facts: [amountFact, unitFact, { label: fl('Reason', lang), value: 'Tarjetas de crédito no aceptadas' }].filter((f): f is EmailFact => !!f),
    ctaLabel: 'Intentar de nuevo',
    ctaUrl: `${SITE_URL}/renter/rent`,
  }) : baseTemplate({
    lang,
    eyebrow: 'Payment',
    heading: 'Payment refunded',
    bodyHtml: `Hi ${escapeHtml(renterName)}, rent can only be paid by <strong>debit card or bank account</strong>. Credit cards aren't accepted. Your payment was fully refunded and rent is still due. Please try again with a debit card or bank transfer.`,
    preheader: 'Your payment was fully refunded. Rent is still due.',
    facts: [amountFact, unitFact, { label: fl('Reason', lang), value: 'Credit cards not accepted' }].filter((f): f is EmailFact => !!f),
    ctaLabel: 'Try again',
    ctaUrl: `${SITE_URL}/renter/rent`,
  })
  return sendEmail({ to, subject: lang === 'es' ? 'Tu pago de renta fue reembolsado' : 'Your rent payment was refunded', html })
}

export async function sendRentDueEmail({ to, landlordName, unitLabels, lang = 'en' }: { to: string; landlordName: string; unitLabels: string[]; lang?: Lang }) {
  const monthLabel = new Date().toLocaleDateString(lang === 'es' ? 'es-ES' : undefined, { month: 'long', year: 'numeric' })
  const list = lang === 'es'
    ? (unitLabels.length === 1 ? unitLabels[0] : `${unitLabels.length} unidades`)
    : (unitLabels.length === 1 ? unitLabels[0] : `${unitLabels.length} units`)
  // A single unit gets a real fact row; a digest across many units stays
  // prose (a growing list of rows doesn't read well in the same 3-4-row
  // table every other email uses), but still gets a proper preheader.
  const singleUnitFact: EmailFact[] = unitLabels.length === 1 ? [{ label: fl('Unit', lang), value: unitLabels[0] }] : []
  const html = lang === 'es' ? baseTemplate({
    lang,
    eyebrow: 'Pago',
    heading: `Renta vence: ${escapeHtml(monthLabel)}`,
    bodyHtml: `Hola ${escapeHtml(landlordName)}, el seguimiento de renta de ${escapeHtml(monthLabel)} está listo para ${escapeHtml(list)}. Márcala como recibida con un toque en cuanto llegue, sin necesidad de escribir nada.`,
    preheader: `${monthLabel} · ${list}`,
    facts: singleUnitFact,
    ctaLabel: 'Ver panel',
    ctaUrl: `${SITE_URL}/landlord`,
  }) : baseTemplate({
    lang,
    eyebrow: 'Payment',
    heading: `Rent is due: ${escapeHtml(monthLabel)}`,
    bodyHtml: `Hi ${escapeHtml(landlordName)}, ${escapeHtml(monthLabel)} rent tracking is ready for ${escapeHtml(list)}. Mark it received in one tap once it comes in, no typing required.`,
    preheader: `${monthLabel} · ${list}`,
    facts: singleUnitFact,
    ctaLabel: 'View dashboard',
    ctaUrl: `${SITE_URL}/landlord`,
  })
  return sendEmail({ to, subject: lang === 'es' ? `Renta vence: ${monthLabel}` : `Rent due: ${monthLabel}`, html })
}

export async function sendRentDueRenterEmail({ to, unitLabel, amount, lang = 'en' }: { to: string; unitLabel: string; amount: number; lang?: Lang }) {
  const monthLabel = new Date().toLocaleDateString(lang === 'es' ? 'es-ES' : undefined, { month: 'long', year: 'numeric' })
  const html = lang === 'es' ? baseTemplate({
    lang,
    eyebrow: 'Pago',
    heading: `Renta vence: ${escapeHtml(monthLabel)}`,
    bodyHtml: `Se debe $${amount.toFixed(2)} para ${escapeHtml(unitLabel)}. Paga con tarjeta de débito o cuenta bancaria, directamente desde tu panel.`,
    preheader: `$${amount.toFixed(2)} · ${unitLabel}`,
    facts: [
      { label: fl('Amount', lang), value: `$${amount.toFixed(2)}` },
      { label: fl('Unit', lang), value: unitLabel },
      { label: fl('For', lang), value: monthLabel },
    ],
    ctaLabel: 'Pagar renta',
    ctaUrl: `${SITE_URL}/renter/rent`,
  }) : baseTemplate({
    lang,
    eyebrow: 'Payment',
    heading: `Rent is due: ${escapeHtml(monthLabel)}`,
    bodyHtml: `$${amount.toFixed(2)} is due for ${escapeHtml(unitLabel)}. Pay by debit card or bank account, right from your dashboard.`,
    preheader: `$${amount.toFixed(2)} · ${unitLabel}`,
    facts: [
      { label: fl('Amount', lang), value: `$${amount.toFixed(2)}` },
      { label: fl('Unit', lang), value: unitLabel },
      { label: fl('For', lang), value: monthLabel },
    ],
    ctaLabel: 'Pay rent',
    ctaUrl: `${SITE_URL}/renter/rent`,
  })
  return sendEmail({ to, subject: lang === 'es' ? `Renta vence: ${monthLabel}` : `Rent due: ${monthLabel}`, html })
}

export async function sendRentLateRenterEmail({ to, unitLabel, amount, lateFeeAdded, lang = 'en' }: { to: string; unitLabel: string; amount: number; lateFeeAdded: number | null; lang?: Lang }) {
  const facts: EmailFact[] = [
    { label: fl('Amount due', lang), value: `$${amount.toFixed(2)}` },
    { label: fl('Unit', lang), value: unitLabel },
    ...(lateFeeAdded ? [{ label: fl('Late fee added', lang), value: `$${lateFeeAdded.toFixed(2)}` }] : []),
  ]
  const html = lang === 'es' ? baseTemplate({
    lang,
    eyebrow: 'Pago',
    heading: 'La renta está atrasada',
    bodyHtml: `La renta de ${escapeHtml(unitLabel)} sigue sin pagarse. Paga lo antes posible.`,
    preheader: `$${amount.toFixed(2)} · ${unitLabel}`,
    facts,
    ctaLabel: 'Pagar renta',
    ctaUrl: `${SITE_URL}/renter/rent`,
  }) : baseTemplate({
    lang,
    eyebrow: 'Payment',
    heading: 'Rent is now late',
    bodyHtml: `Rent for ${escapeHtml(unitLabel)} is still unpaid. Pay as soon as you can.`,
    preheader: `$${amount.toFixed(2)} · ${unitLabel}`,
    facts,
    ctaLabel: 'Pay rent',
    ctaUrl: `${SITE_URL}/renter/rent`,
  })
  return sendEmail({ to, subject: lang === 'es' ? `Renta atrasada: ${unitLabel}` : `Rent is late: ${unitLabel}`, html })
}

export async function sendRentLateLandlordEmail({
  to,
  landlordName,
  unitLabel,
  amount,
  lateFeeAdded,
  lang = 'en',
}: {
  to: string
  landlordName: string
  unitLabel: string
  // Optional for the same reason as sendCreditCardRejectedEmail — this
  // function only just started receiving a real number; keep it degrading
  // gracefully rather than making every call site update at once.
  amount?: number | null
  lateFeeAdded: number | null
  lang?: Lang
}) {
  const facts: EmailFact[] = [
    { label: fl('Unit', lang), value: unitLabel },
    ...(amount != null ? [{ label: fl('Amount due', lang), value: `$${amount.toFixed(2)}` }] : []),
    ...(lateFeeAdded ? [{ label: fl('Late fee added', lang), value: `$${lateFeeAdded.toFixed(2)}` }] : []),
  ]
  const html = lang === 'es' ? baseTemplate({
    lang,
    eyebrow: 'Pago',
    heading: 'La renta está atrasada',
    bodyHtml: `Hola ${escapeHtml(landlordName)}, la renta de ${escapeHtml(unitLabel)} está vencida y sigue sin pagarse.${lateFeeAdded ? ' Se agregó automáticamente un cargo por atraso.' : ' Se notificó al inquilino.'}`,
    preheader: amount != null ? `$${amount.toFixed(2)} · ${unitLabel}` : unitLabel,
    facts,
    ctaLabel: 'Ver panel',
    ctaUrl: `${SITE_URL}/landlord`,
  }) : baseTemplate({
    lang,
    eyebrow: 'Payment',
    heading: 'Rent is now late',
    bodyHtml: `Hi ${escapeHtml(landlordName)}, rent for ${escapeHtml(unitLabel)} is past due and still unpaid.${lateFeeAdded ? ' A late fee was automatically added.' : ' The renter has been notified.'}`,
    preheader: amount != null ? `$${amount.toFixed(2)} · ${unitLabel}` : unitLabel,
    facts,
    ctaLabel: 'View dashboard',
    ctaUrl: `${SITE_URL}/landlord`,
  })
  return sendEmail({ to, subject: lang === 'es' ? `Renta atrasada: ${unitLabel}` : `Rent is late: ${unitLabel}`, html })
}

// From the landing-page help widget, before anyone is signed in — no known
// preference, English only, same reasoning as the pre-signup invites above.
export async function sendSupportEscalationEmail({
  askerEmail,
  question,
}: {
  askerEmail: string
  question: string
}) {
  const html = baseTemplate({
    lang: 'en',
    eyebrow: 'Support',
    heading: 'A question from the landing page',
    bodyHtml: `<strong>${escapeHtml(askerEmail)}</strong> asked:<br /><br />"${escapeHtml(question)}"`,
    ctaLabel: 'Reply to asker',
    ctaUrl: `mailto:${escapeHtml(askerEmail)}`,
  })
  return sendToAdmins(`Support question from ${askerEmail}`, html)
}

export async function sendSupportConfirmationEmail({ to, question }: { to: string; question: string }) {
  const html = baseTemplate({
    lang: 'en',
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
  lang = 'en',
}: {
  to: string
  fromName: string
  text: string
  kind: 'proposed' | 'confirmed'
  role: 'landlord' | 'renter' | 'contractor'
  threadId: string
  lang?: Lang
}) {
  // `text` is the chat message exactly as the sender composed it (already
  // in whatever language their own UI was in) — it's someone else's actual
  // words, so it's carried through verbatim, never re-translated. Only the
  // wrapper around it (eyebrow, heading, CTA) follows the recipient's
  // language.
  const heading = lang === 'es'
    ? (kind === 'proposed' ? `${fromName} propuso un horario` : `${fromName} confirmó un horario`)
    : (kind === 'proposed' ? `${fromName} proposed a time` : `${fromName} confirmed a time`)
  const html = baseTemplate({
    lang,
    eyebrow: lang === 'es' ? 'Horario' : 'Schedule',
    heading: escapeHtml(heading),
    bodyHtml: escapeHtml(text),
    ctaLabel: lang === 'es' ? 'Abrir conversación' : 'Open conversation',
    ctaUrl: `${SITE_URL}/${role}/messages/${threadId}`,
  })
  return sendEmail({ to, subject: heading, html })
}

// One shared reminder, three sets of copy — the tenant, the contractor, and
// the landlord all benefit from a heads-up the day before an appointment
// (fewer no-shows, one last chance for the tenant to add or fix access
// notes before it's actually needed), so all three get one, not just the
// tenant. Sent once per confirmed date by cron/appointment-reminder — see
// that route for how it avoids sending twice for the same appointment.
export async function sendAppointmentReminderEmail({
  to,
  role,
  name,
  category,
  propertyLabel,
  unitLabel,
  when,
  jobId,
  accessNotes,
  isDiy,
  lang = 'en',
}: {
  to: string
  role: 'renter' | 'contractor' | 'landlord'
  name: string
  category: string
  propertyLabel: string
  unitLabel?: string | null
  when: string
  jobId: string
  accessNotes?: string | null
  // Only meaningful for role 'landlord' — a normal job's landlord reminder
  // is a passive FYI (a contractor is doing the work), but on a job the
  // landlord marked "handle it myself" they're the one actually expected to
  // show up, and "nothing is needed from you" is flatly untrue there.
  isDiy?: boolean
  lang?: Lang
}) {
  const ctaUrl = `${SITE_URL}/${role}/jobs/${jobId}`
  const cat = escapeHtml(category)
  const at = escapeHtml(unitLabel ? `${propertyLabel}, ${unitLabel}` : propertyLabel)
  const whenEsc = escapeHtml(when)

  const accessNotesBlock = accessNotes
    ? lang === 'es'
      ? `<br /><br /><strong>Notas de acceso del inquilino:</strong> "${escapeHtml(accessNotes)}"`
      : `<br /><br /><strong>The tenant's access notes:</strong> "${escapeHtml(accessNotes)}"`
    : ''

  const copy =
    lang === 'es'
      ? {
          eyebrow: 'Recordatorio',
          heading: `Mañana: ${cat}`,
          renterBody: `Hola ${escapeHtml(name)}, un contratista está programado para visitar tu unidad mañana, <strong>${whenEsc}</strong>, por un trabajo de <strong>${cat}</strong>. ${accessNotes ? 'Si algo cambió, puedes actualizar tus notas de acceso desde el trabajo.' : 'Si el contratista necesita saber algo para entrar (código de la caja de seguridad, si estarás en casa, etc.), puedes agregarlo desde el trabajo antes de que lleguen.'}`,
          contractorBody: `Hola ${escapeHtml(name)}, tienes un trabajo de <strong>${cat}</strong> programado para mañana, <strong>${whenEsc}</strong>, en ${at}.${accessNotesBlock}`,
          landlordBody: isDiy
            ? `Hola ${escapeHtml(name)}, no lo olvides: mañana, <strong>${whenEsc}</strong>, harás tú mismo el trabajo de <strong>${cat}</strong> en ${at}.`
            : `Hola ${escapeHtml(name)}, el trabajo de <strong>${cat}</strong> en ${at} está programado para mañana, <strong>${whenEsc}</strong>. Esto es solo un aviso, no se necesita nada de tu parte.`,
          ctaLabel: 'Ver trabajo',
        }
      : {
          eyebrow: 'Reminder',
          heading: `Tomorrow: ${cat}`,
          renterBody: `Hi ${escapeHtml(name)}, a contractor is scheduled to visit your unit tomorrow, <strong>${whenEsc}</strong>, for a <strong>${cat}</strong> job. ${accessNotes ? 'If anything has changed, you can update your access notes from the job.' : "If the contractor needs to know anything to get in (a lockbox code, whether you'll be home, etc.), you can add it from the job before they arrive."}`,
          contractorBody: `Hi ${escapeHtml(name)}, you have a <strong>${cat}</strong> job scheduled for tomorrow, <strong>${whenEsc}</strong>, at ${at}.${accessNotesBlock}`,
          landlordBody: isDiy
            ? `Hi ${escapeHtml(name)}, don't forget: you're doing the <strong>${cat}</strong> job at ${at} yourself tomorrow, <strong>${whenEsc}</strong>.`
            : `Hi ${escapeHtml(name)}, the <strong>${cat}</strong> job at ${at} is scheduled for tomorrow, <strong>${whenEsc}</strong>. This is just a heads-up, nothing is needed from you.`,
          ctaLabel: 'View job',
        }

  const bodyHtml = role === 'renter' ? copy.renterBody : role === 'contractor' ? copy.contractorBody : copy.landlordBody

  const html = baseTemplate({
    lang,
    eyebrow: copy.eyebrow,
    heading: copy.heading,
    bodyHtml,
    preheader: `${whenEsc} · ${at}`,
    facts: [
      { label: fl('Job', lang), value: category },
      { label: fl('Where', lang), value: unitLabel ? `${propertyLabel}, ${unitLabel}` : propertyLabel },
      { label: lang === 'es' ? 'Cuándo' : 'When', value: when },
    ],
    ctaLabel: copy.ctaLabel,
    ctaUrl,
  })

  return sendEmail({
    to,
    subject: lang === 'es' ? `Mañana: trabajo de ${category}` : `Tomorrow: ${category} appointment`,
    html,
  })
}

export async function sendJobInviteEmail({
  to,
  landlordName,
  jobCategory,
  jobId,
  lang = 'en',
}: {
  to: string
  landlordName: string
  jobCategory: string
  jobId: string
  lang?: Lang
}) {
  const html = lang === 'es' ? baseTemplate({
    lang,
    eyebrow: 'Nuevo trabajo',
    heading: `${escapeHtml(landlordName)} publicó un trabajo para ti`,
    bodyHtml: `${escapeHtml(landlordName)} te escribió y acaba de publicar un nuevo trabajo de <strong>${escapeHtml(jobCategory)}</strong>. Échale un vistazo y envía una oferta si estás disponible. También está abierto a otros contratistas, así que no esperes demasiado.`,
    ctaLabel: 'Ver trabajo',
    ctaUrl: `${SITE_URL}/contractor/jobs/${jobId}`,
  }) : baseTemplate({
    lang,
    eyebrow: 'New job',
    heading: `${escapeHtml(landlordName)} posted a job for you`,
    bodyHtml: `${escapeHtml(landlordName)} messaged you and just posted a new <strong>${escapeHtml(jobCategory)}</strong> job. Take a look and submit a bid if you're available. It's open to other contractors too, so don't wait too long.`,
    ctaLabel: 'View job',
    ctaUrl: `${SITE_URL}/contractor/jobs/${jobId}`,
  })
  return sendEmail({ to, subject: lang === 'es' ? `Nuevo trabajo de ${landlordName}: ${jobCategory}` : `New job from ${landlordName}: ${jobCategory}`, html })
}
