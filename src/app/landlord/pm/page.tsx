'use client'

import { useEffect, useState, useCallback, type ReactNode } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { CountUp } from '@/components/CountUp'
import { useRouter } from 'next/navigation'
import { BuildingIcon, WrenchIcon, DollarSignIcon, PlusIcon, ShieldIcon, ChevronDownIcon, StarIcon, DownloadIcon } from '@/components/icons'
import { startDmThread } from '@/lib/dmThreads'
import { downloadCsv } from '@/lib/csvExport'
import { GoogleTranslateToggle } from '@/components/GoogleTranslateToggle'
import { RentTrendChart, type MonthBucket } from '@/components/RentTrendChart'
import { BottomTabBar } from '@/components/BottomTabBar'
import { LANDLORD_TABS } from '@/lib/navTabs'

const StripePaymentModal = dynamic(() => import('@/components/StripePaymentModal').then((m) => m.StripePaymentModal), { ssr: false })

type Membership = { organizationId: string; organizationName: string; memberRole: 'admin' | 'staff'; canViewFinancials: boolean }
// Every client this org has ever invited, any status -- from
// /api/pm/clients, which already returned this and was simply never
// read anywhere. Merged with /api/pm/dashboard's stats (accepted only;
// a pending invite has no portfolio to report on yet).
type ClientRow = {
  id: string
  ownerUserId: string
  ownerName: string
  approvalThreshold: number
  managementFee: number | null
  managementFeeFrequency: 'one_time' | 'monthly' | null
  managementFeeType: 'flat' | 'percent_of_rent'
  managementFeePercent: number | null
  feeApproved: boolean
  monthlySummaryEnabled: boolean
  ownerReadOnly: boolean
  status: 'pending' | 'accepted'
  requestedBy: 'pm' | 'owner'
  propertyCount?: number
  unitCount?: number
  occupiedUnitCount?: number
  openJobCount?: number
  rentCollectedThisMonth?: number | null
}
type Staff = {
  id: string
  userId: string | null
  name: string
  memberRole: 'admin' | 'staff'
  canViewFinancials: boolean
  scopeAllClients: boolean
  notificationMode: 'realtime' | 'digest'
  assignedOwnerIds: string[]
  status: 'pending' | 'accepted'
}
type AuditEntry = { id: string; action: string; amount: number | null; createdAt: string; ownerName: string; actorName: string }
type NetworkContractor = {
  id: string
  name: string
  categories: string[]
  jobsCount: number
  totalPaid: number
  lastUsedAt: string | null
  lastClientAddress: string | null
  isFavorite: boolean
}
type IncomingInvite = {
  id: string
  orgName: string
  status: 'pending' | 'accepted'
  requestedBy: 'pm' | 'owner'
  approvalThreshold: number
  managementFee: number | null
  managementFeeFrequency: 'one_time' | 'monthly' | null
  managementFeeType: 'flat' | 'percent_of_rent'
  managementFeePercent: number | null
  feeApproved: boolean
  ownerReadOnly: boolean
}

const SPECIALTY_LABELS: Record<string, string> = {
  single_family: 'Single-family',
  multifamily: 'Multifamily',
  short_term: 'Short-term/vacation',
  commercial: 'Commercial',
  hoa: 'HOA',
}

const ACTION_LABELS: Record<string, string> = {
  job_payment_started: 'approved a job payment',
  job_payment_blocked_needs_owner_signoff: 'tried to approve a payment over threshold',
  job_bulk_approved: 'approved completed work',
  property_added_for_owner: 'added a property',
}

type PendingJob = { id: string; category: string; createdAt: string; ownerUserId: string; ownerName: string; address: string }

type Tab = 'overview' | 'clients' | 'team' | 'activity'

function StatTile({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: typeof BuildingIcon
  label: string
  value: ReactNode
  onClick?: () => void
}) {
  const content = (
    <>
      <Icon className="w-4 h-4 text-[#12A5A9] shrink-0" />
      <div className="min-w-0">
        <p className="text-white font-semibold text-sm tabular-nums">{value}</p>
        <p className="text-white/40 text-xs leading-tight">{label}</p>
      </div>
    </>
  )
  if (!onClick) {
    return <div className="bg-white/4 border border-white/8 rounded-xl p-3 flex items-center gap-3">{content}</div>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white/4 border border-white/8 rounded-xl p-3 flex items-center gap-3 text-left hover:bg-white/8 hover:border-white/15 transition w-full"
    >
      {content}
    </button>
  )
}

function TabBar({ tabs, active, onChange }: { tabs: { key: Tab; label: string; count?: number }[]; active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex gap-1 bg-white/3 border border-white/8 rounded-xl p-1 mb-6 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`flex-1 whitespace-nowrap text-xs font-semibold px-3 py-2 rounded-lg transition ${
            active === t.key ? 'bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white' : 'text-white/50 hover:text-white/80'
          }`}
        >
          {t.label}
          {typeof t.count === 'number' && t.count > 0 && <span className={active === t.key ? 'text-white/80' : 'text-white/30'}> ({t.count})</span>}
        </button>
      ))}
    </div>
  )
}

function ChecklistRow({
  done,
  label,
  href,
  onClick,
  anchor,
}: {
  done: boolean
  label: string
  href?: string
  onClick?: () => void
  anchor?: string
}) {
  const content = (
    <>
      <span
        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] ${
          done ? 'bg-[#12A5A9] text-white' : 'border border-white/20 text-transparent'
        }`}
      >
        ✓
      </span>
      <span className={`text-sm ${done ? 'text-white/40 line-through' : 'text-white'}`}>{label}</span>
    </>
  )
  const className = 'flex items-center gap-2.5 w-full text-left hover:opacity-80 transition'
  if (done) return <div className={className}>{content}</div>
  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.()
        if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }}
      className={className}
    >
      {content}
    </button>
  )
}

function StatusPill({ status }: { status: 'pending' | 'accepted' }) {
  return status === 'accepted' ? (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#0A7B7E]/20 text-[#12A5A9]">Active</span>
  ) : (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400">Invite pending</span>
  )
}

// Collapsed by default -- a form that's always open, whether or not you're
// about to use it, was a big part of what made this page feel cluttered.
function Collapsible({ label, icon, children }: { label: string; icon: typeof PlusIcon; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const Icon = icon
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-left hover:bg-white/5 transition"
      >
        <span className="flex items-center gap-2 text-white text-sm font-semibold">
          <Icon className="w-4 h-4 text-[#12A5A9]" /> {label}
        </span>
        <ChevronDownIcon className={`w-4 h-4 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="bg-white/3 border border-t-0 border-white/8 rounded-b-xl px-4 py-4 -mt-1">{children}</div>}
    </div>
  )
}

async function shrinkImage(file: File, maxSide: number, type: 'image/png' | 'image/jpeg'): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve) => canvas.toBlob(resolve, type, 0.85))
  } catch {
    return null
  }
}

export default function PmDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [pendingStaffInvite, setPendingStaffInvite] = useState<{ id: string; orgName: string } | null>(null)
  const [incomingInvites, setIncomingInvites] = useState<IncomingInvite[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [months, setMonths] = useState<MonthBucket[]>([])
  const [complianceAlerts, setComplianceAlerts] = useState<
    { id: string; itemType: string; daysUntil: number; address: string; city: string; ownerName: string; propertyId: string }[]
  >([])
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [staff, setStaff] = useState<Staff[]>([])
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [contractors, setContractors] = useState<NetworkContractor[]>([])
  const [showContractors, setShowContractors] = useState(false)
  const [messagingContractorId, setMessagingContractorId] = useState<string | null>(null)
  const [pendingJobs, setPendingJobs] = useState<PendingJob[]>([])
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set())
  const [approving, setApproving] = useState(false)
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [expandedClient, setExpandedClient] = useState<string | null>(null)
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null)
  // Same Stripe Connect account a landlord already sets up on Profile to
  // receive rent -- management fees land in that same account, so an
  // admin who hasn't done that yet needs to know before trying to bill
  // anyone, not find out only when a client's payment fails.
  const [payoutStatus, setPayoutStatus] = useState<'not_started' | 'onboarding' | 'active' | null>(null)

  const [profileSlug, setProfileSlug] = useState<string | null>(null)
  const [openToClients, setOpenToClients] = useState(false)
  const [pitch, setPitch] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  // Trust-building profile fields — research across real PM software
  // (Buildium/AppFolio/DoorLoop) and what landlords actually check before
  // trusting a PM consistently surfaces these as the real trust-gates, not
  // just a one-line pitch and a star rating (all the public profile had
  // before this).
  const [licenseNumber, setLicenseNumber] = useState('')
  const [insured, setInsured] = useState(false)
  const [yearsInBusiness, setYearsInBusiness] = useState<number | ''>('')
  const [specialties, setSpecialties] = useState<string[]>([])
  const [serviceZipsText, setServiceZipsText] = useState('')
  const [pricingNote, setPricingNote] = useState('')
  // Branding, about, contact and team -- what a landlord comparing PMs
  // actually looks at on the public profile.
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [brandColor, setBrandColor] = useState<string | null>(null)
  const [about, setAbout] = useState('')
  const [website, setWebsite] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [officeHours, setOfficeHours] = useState('')
  const [showTeam, setShowTeam] = useState(false)
  const [brandingBusy, setBrandingBusy] = useState<null | 'logo' | 'cover'>(null)
  const [profileMsg, setProfileMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [profileCopied, setProfileCopied] = useState(false)
  const [viewsTotal, setViewsTotal] = useState(0)
  const [viewsThisMonth, setViewsThisMonth] = useState(0)
  const [checklistDismissed, setChecklistDismissed] = useState(false)

  const [orgName, setOrgName] = useState('')
  const [creating, setCreating] = useState(false)

  const [clientEmail, setClientEmail] = useState('')
  const [invitingClient, setInvitingClient] = useState(false)
  const [clientInviteMsg, setClientInviteMsg] = useState<string | null>(null)

  const [myStatus, setMyStatus] = useState<{
    propertyCount: number
    unitCount: number
    openJobCount: number
    entries: { id: string; action: string; amount: number | null; createdAt: string; actorName: string; jobId: string | null; detail: string | null }[]
  } | null>(null)
  const [savingThreshold, setSavingThreshold] = useState(false)
  const [inviteThresholds, setInviteThresholds] = useState<Record<string, string>>({})
  const [readOnlyPreviewFor, setReadOnlyPreviewFor] = useState<string | null>(null)

  // Monthly-summary editor: the PM sees the exact email the owner will get
  // (last month's real figures), edits the personal note, and can have AI
  // rewrite it. AI only ever touches the note -- the figures are computed
  // from real payments at send time.
  const [summaryEditor, setSummaryEditor] = useState<{ portfolioId: string; ownerName: string } | null>(null)
  const [summaryHtml, setSummaryHtml] = useState('')
  const [summaryNote, setSummaryNote] = useState('')
  const [savedSummaryNote, setSavedSummaryNote] = useState('')
  const [summaryInstruction, setSummaryInstruction] = useState('')
  const [summaryBusy, setSummaryBusy] = useState<null | 'loading' | 'rewrite' | 'save' | 'test'>(null)
  const [summaryMsg, setSummaryMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const openSummaryEditor = async (c: { id: string; ownerName: string }) => {
    setSummaryEditor({ portfolioId: c.id, ownerName: c.ownerName })
    setSummaryHtml('')
    setSummaryMsg(null)
    setSummaryInstruction('')
    setSummaryBusy('loading')
    const res = await fetch(`/api/pm/clients/${c.id}/summary`).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    if (res?.ok) {
      setSummaryHtml(data.html || '')
      setSummaryNote(data.note || '')
      setSavedSummaryNote(data.note || '')
    } else {
      setSummaryMsg({ tone: 'error', text: data.error || 'Could not load the preview.' })
    }
    setSummaryBusy(null)
  }

  const summaryPost = async (action: 'preview' | 'rewrite' | 'test', extra: Record<string, unknown> = {}) => {
    if (!summaryEditor) return null
    const res = await fetch(`/api/pm/clients/${summaryEditor.portfolioId}/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note: summaryNote, ...extra }),
    }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    return { ok: !!res?.ok, data }
  }

  // Re-render the preview shortly after the note stops changing, so it
  // always matches what's in the box.
  useEffect(() => {
    if (!summaryEditor || summaryBusy === 'loading') return
    const timer = setTimeout(async () => {
      const r = await summaryPost('preview')
      if (r?.ok) setSummaryHtml(r.data.html || '')
    }, 600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryNote, summaryEditor])

  const handleSummaryRewrite = async (instruction: string) => {
    if (!instruction.trim()) return
    setSummaryBusy('rewrite')
    setSummaryMsg(null)
    const r = await summaryPost('rewrite', { instruction })
    if (r?.ok) {
      setSummaryNote(r.data.note || '')
      setSummaryInstruction('')
    } else {
      setSummaryMsg({ tone: 'error', text: r?.data.error || 'Could not rewrite the note.' })
    }
    setSummaryBusy(null)
  }

  const handleSummarySave = async () => {
    if (!summaryEditor) return
    setSummaryBusy('save')
    setSummaryMsg(null)
    const res = await fetch(`/api/pm/clients/${summaryEditor.portfolioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlySummaryNote: summaryNote }),
    }).catch(() => null)
    if (res?.ok) {
      setSavedSummaryNote(summaryNote)
      setSummaryMsg({ tone: 'ok', text: 'Saved. This note goes out with every monthly summary until you change it.' })
    } else {
      const data = res ? await res.json().catch(() => ({})) : {}
      setSummaryMsg({ tone: 'error', text: data.error || 'Could not save the note.' })
    }
    setSummaryBusy(null)
  }

  const handleSummaryTest = async () => {
    setSummaryBusy('test')
    setSummaryMsg(null)
    const r = await summaryPost('test')
    setSummaryMsg(r?.ok ? { tone: 'ok', text: `Test sent to ${r.data.sentTo}.` } : { tone: 'error', text: r?.data.error || 'Could not send the test.' })
    setSummaryBusy(null)
  }

  const [staffEmail, setStaffEmail] = useState('')
  const [staffFinancials, setStaffFinancials] = useState(false)
  const [invitingStaff, setInvitingStaff] = useState(false)
  const [staffInviteMsg, setStaffInviteMsg] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [orgRes, invitesRes] = await Promise.all([
        fetch('/api/pm/organizations').then((r) => r.json()),
        fetch('/api/pm/invites-for-me').then((r) => r.json()),
      ])
      setMembership(orgRes.membership || null)
      setPendingStaffInvite(orgRes.pendingStaffInvite || null)
      setIncomingInvites(invitesRes.managedBy || [])

      if (orgRes.membership) {
        const [clientsRes, dashRes, staffRes, auditRes, contractorsRes, pendingRes] = await Promise.all([
          fetch('/api/pm/clients').then((r) => r.json()),
          fetch('/api/pm/dashboard').then((r) => r.json()),
          fetch('/api/pm/staff').then((r) => r.json()),
          fetch('/api/pm/audit-log').then((r) => r.json()),
          fetch('/api/pm/contractors').then((r) => r.json()),
          fetch('/api/pm/jobs/pending-approval').then((r) => r.json()),
        ])
        setContractors(contractorsRes.contractors || [])
        setPendingJobs(pendingRes.jobs || [])
        const statsByPortfolio = new Map((dashRes.clients || []).map((c: any) => [c.portfolioId, c]))
        setClients(
          (clientsRes.clients || []).map((c: any) => ({
            ...c,
            ...(statsByPortfolio.get(c.id) || {}),
          }))
        )
        setStaff(staffRes.staff || [])
        setAuditLog(auditRes.entries || [])
        setMonths(dashRes.months || [])
        setComplianceAlerts(dashRes.complianceAlerts || [])

        if (orgRes.membership.memberRole === 'admin') {
          // Both awaited here (not fire-and-forget) so loading only
          // flips to false once these have actually landed -- caught
          // live: an unawaited profile-settings fetch resolving AFTER a
          // user had already toggled "Open to new clients" clobbered
          // their click back to the stale pre-load value, since nothing
          // stopped a slow, already-in-flight GET from overwriting a
          // newer optimistic update.
          const [connectData, profileData] = await Promise.all([
            fetch('/api/stripe/connect/status')
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
            fetch('/api/pm/profile-settings')
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ])
          setPayoutStatus(connectData?.status || 'not_started')
          if (profileData) {
            setProfileSlug(profileData.slug)
            setOpenToClients(profileData.openToClients)
            setPitch(profileData.pitch || '')
            setLicenseNumber(profileData.licenseNumber || '')
            setInsured(!!profileData.insured)
            setYearsInBusiness(profileData.yearsInBusiness ?? '')
            setSpecialties(profileData.specialties || [])
            setServiceZipsText((profileData.serviceZips || []).join(', '))
            setPricingNote(profileData.pricingNote || '')
            setLogoUrl(profileData.logoUrl || null)
            setCoverUrl(profileData.coverUrl || null)
            setBrandColor(profileData.brandColor || null)
            setAbout(profileData.about || '')
            setWebsite(profileData.website || '')
            setContactPhone(profileData.contactPhone || '')
            setContactEmail(profileData.contactEmail || '')
            setOfficeHours(profileData.officeHours || '')
            setShowTeam(!!profileData.showTeam)
            setViewsTotal(profileData.viewsTotal || 0)
            setViewsThisMonth(profileData.viewsThisMonth || 0)
          }
        }
      } else if ((invitesRes.managedBy || []).some((m: any) => m.status === 'accepted')) {
        const statusRes = await fetch('/api/pm/my-status').then((r) => r.json())
        if (statusRes.managed) setMyStatus(statusRes)
      }
    } catch {
      setError('Could not load your property management dashboard.')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
    try {
      if (localStorage.getItem('pm-checklist-dismissed') === '1') setChecklistDismissed(true)
    } catch {}
  }, [loadAll])

  const dismissChecklist = () => {
    setChecklistDismissed(true)
    try {
      localStorage.setItem('pm-checklist-dismissed', '1')
    } catch {}
  }

  const handleCreateOrg = async () => {
    if (!orgName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/pm/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your organization')
    }
    setCreating(false)
  }

  const handleInviteClient = async () => {
    if (!clientEmail.trim()) return
    setInvitingClient(true)
    setClientInviteMsg(null)
    try {
      const res = await fetch('/api/pm/clients/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clientEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setClientInviteMsg(
          data.error === 'already_invited_or_managed'
            ? 'That landlord is already invited or managed by a PM.'
            : data.error || 'Could not send that invite.'
        )
      } else {
        setClientInviteMsg(
          data.invitedByEmail
            ? "Invite sent. They don't have an account yet, so we emailed them a signup link. It'll show up here once they join."
            : 'Invite sent. They can accept from their dashboard.'
        )
        setClientEmail('')
        await loadAll()
      }
    } catch {
      setClientInviteMsg('Could not send that invite.')
    }
    setInvitingClient(false)
  }

  const handleInviteStaff = async () => {
    if (!staffEmail.trim()) return
    setInvitingStaff(true)
    setStaffInviteMsg(null)
    try {
      const res = await fetch('/api/pm/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: staffEmail.trim(), canViewFinancials: staffFinancials }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStaffInviteMsg(
          data.error === 'no_account_found'
            ? 'No Prophandld landlord account found with that email.'
            : data.error === 'already_invited_or_on_a_team'
              ? 'That person is already on a team.'
              : data.error || 'Could not send that invite.'
        )
      } else {
        setStaffInviteMsg('Invite sent.')
        setStaffEmail('')
        setStaffFinancials(false)
        await loadAll()
      }
    } catch {
      setStaffInviteMsg('Could not send that invite.')
    }
    setInvitingStaff(false)
  }

  const handleAcceptInvite = async (id: string, approvalThreshold?: number) => {
    // Found live: this used to ignore the response entirely -- a landlord
    // already accepted by a different PM org (the DB only allows one
    // accepted relationship at a time, idx_pm_portfolios_one_active_pm)
    // got a silent no-op on click, with the invite banner just sitting
    // there forever and zero indication anything went wrong.
    const res = await fetch('/api/pm/clients/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolioId: id,
        ...(approvalThreshold !== undefined ? { approvalThreshold } : {}),
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Could not accept that invite.')
      return
    }
    await loadAll()
  }

  const handleDeclineInvite = async (id: string) => {
    await fetch(`/api/pm/clients/${id}`, { method: 'DELETE' })
    await loadAll()
  }

  // The owner's own permission grant to the PM, not something the PM sets
  // unilaterally on the owner's behalf -- found live: there was no owner-
  // facing control for this at all, only a read-only number the PM admin
  // had set.
  // Sends back the exact terms on screen; the server refuses (409) if the
  // PM changed them since this page loaded, so an owner can never approve
  // an amount they didn't actually see.
  const [approvingFee, setApprovingFee] = useState(false)
  const handleApproveFee = async (inv: IncomingInvite) => {
    setApprovingFee(true)
    setFeePayError(null)
    const res = await fetch('/api/pm/my-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approveFee: {
          type: inv.managementFeeType,
          amount: inv.managementFee,
          percent: inv.managementFeePercent,
          frequency: inv.managementFeeFrequency,
        },
      }),
    }).catch(() => null)
    if (!res || !res.ok) {
      const data = res ? await res.json().catch(() => ({})) : {}
      setFeePayError(data.error || 'Could not approve that fee. Try again.')
    }
    await loadAll()
    setApprovingFee(false)
  }

  const handleSetOwnThreshold = async (value: number) => {
    setSavingThreshold(true)
    await fetch('/api/pm/my-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalThreshold: value }),
    }).catch(() => {})
    await loadAll()
    setSavingThreshold(false)
  }

  // Admin accepting a request the OWNER started (the reverse of
  // handleAcceptInvite, which is the owner accepting a PM-started one).
  const handleAcceptOwnerRequest = async (id: string) => {
    const res = await fetch(`/api/pm/clients/${id}/accept`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Could not accept that request')
      return
    }
    await loadAll()
  }

  const handleToggleOpenToClients = async (value: boolean) => {
    setSavingProfile(true)
    setOpenToClients(value)
    try {
      const res = await fetch('/api/pm/profile-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openToClients: value }),
      })
      const data = await res.json()
      if (data.slug) setProfileSlug(data.slug)
    } catch {
      setOpenToClients(!value)
    }
    setSavingProfile(false)
  }

  const handleSavePitch = async () => {
    setSavingProfile(true)
    await fetch('/api/pm/profile-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pitch }),
    }).catch(() => {})
    setSavingProfile(false)
  }

  // Surfaces the server's validation message (bad website link, email,
  // over-length text) instead of silently dropping it -- it used to
  // swallow every error, so an invalid value just quietly didn't save.
  const saveProfileField = async (field: string, value: unknown) => {
    setSavingProfile(true)
    setProfileMsg(null)
    const res = await fetch('/api/pm/profile-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    }).catch(() => null)
    if (!res || !res.ok) {
      const data = res ? await res.json().catch(() => ({})) : {}
      setProfileMsg({ tone: 'error', text: data.error || 'Could not save that change.' })
    }
    setSavingProfile(false)
  }

  const handleBrandingUpload = async (kind: 'logo' | 'cover', file: File | undefined) => {
    if (!file) return
    setProfileMsg(null)
    setBrandingBusy(kind)
    // Uploads are capped at 4 MB (the hosting request limit is 4.5 MB), so a
    // big phone photo is shrunk here instead of being rejected.
    let upload: Blob = file
    if (file.size > 4 * 1024 * 1024) {
      upload = (await shrinkImage(file, kind === 'logo' ? 800 : 2000, kind === 'logo' ? 'image/png' : 'image/jpeg')) || file
    }
    if (upload.size > 4 * 1024 * 1024) {
      setProfileMsg({ tone: 'error', text: "That image is too large. Try one under 4 MB." })
      setBrandingBusy(null)
      return
    }
    const form = new FormData()
    form.append('kind', kind)
    form.append('file', upload, file.name)
    const res = await fetch('/api/pm/profile-settings/image', { method: 'POST', body: form }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    if (res?.ok) {
      if (kind === 'logo') setLogoUrl(data.url)
      else setCoverUrl(data.url)
    } else {
      setProfileMsg({
        tone: 'error',
        text: res?.status === 413 ? 'That image is too large. Try one under 4 MB.' : data.error || 'Could not upload that image.',
      })
    }
    setBrandingBusy(null)
  }

  const handleBrandingRemove = async (kind: 'logo' | 'cover') => {
    setBrandingBusy(kind)
    const res = await fetch(`/api/pm/profile-settings/image?kind=${kind}`, { method: 'DELETE' }).catch(() => null)
    if (res?.ok) {
      if (kind === 'logo') setLogoUrl(null)
      else setCoverUrl(null)
    }
    setBrandingBusy(null)
  }

  const handleToggleSpecialty = (key: string) => {
    const next = specialties.includes(key) ? specialties.filter((s) => s !== key) : [...specialties, key]
    setSpecialties(next)
    saveProfileField('specialties', next)
  }

  const handleSaveServiceZips = () => {
    const zips = Array.from(new Set(serviceZipsText.split(',').map((z) => z.trim()).filter((z) => /^\d{5}$/.test(z))))
    setServiceZipsText(zips.join(', '))
    saveProfileField('serviceZips', zips)
  }

  const handleCopyProfileLink = () => {
    if (!profileSlug) return
    navigator.clipboard.writeText(`${window.location.origin}/property-managers/${profileSlug}`).catch(() => {})
    setProfileCopied(true)
    setTimeout(() => setProfileCopied(false), 2000)
  }

  const handleAcceptStaffInvite = async (id: string) => {
    await fetch('/api/pm/staff/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: id }),
    })
    await loadAll()
  }

  const handleDeclineStaffInvite = async (id: string) => {
    await fetch(`/api/pm/staff/${id}`, { method: 'DELETE' })
    await loadAll()
  }

  const [feePaymentModal, setFeePaymentModal] = useState<{ portfolioId: string; clientSecret: string; amount: number; connectedAccountId: string } | null>(null)
  const [feePayError, setFeePayError] = useState<string | null>(null)
  const [payingFee, setPayingFee] = useState(false)

  const handlePayFee = async (portfolioId: string) => {
    setPayingFee(true)
    setFeePayError(null)
    try {
      const res = await fetch(`/api/pm/clients/${portfolioId}/fee/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: 'card' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start that payment')
      setFeePaymentModal({ portfolioId, clientSecret: data.clientSecret, amount: data.amount, connectedAccountId: data.connectedAccountId })
    } catch (err) {
      setFeePayError(err instanceof Error ? err.message : 'Could not start that payment')
    }
    setPayingFee(false)
  }

  const handleMessageContractor = async (c: NetworkContractor) => {
    setMessagingContractorId(c.id)
    try {
      const { threadId, initialDraft } = await startDmThread('landlord', {
        other_user_id: c.id,
        other_role: 'contractor',
        full_name: c.name,
        context_label: null,
        last_job_category: c.categories[0] || null,
        last_job_completed_at: c.lastUsedAt,
        thread_id: null,
      })
      if (initialDraft) sessionStorage.setItem(`dm-draft:${threadId}`, initialDraft)
      router.push(`/landlord/messages/${threadId}`)
    } catch (err) {
      console.error('pm: could not start DM with contractor', err)
      setMessagingContractorId(null)
    }
  }

  const [exportingMonth, setExportingMonth] = useState(false)

  const handleExportMonth = async () => {
    setExportingMonth(true)
    try {
      const month = new Date().toISOString().slice(0, 7)
      const res = await fetch(`/api/pm/export?month=${month}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not export')
      const monthLabel = new Date(month + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      downloadCsv(
        `${membership?.organizationName || 'portfolio'}-${month}.csv`.replace(/\s+/g, '-'),
        ['Client', 'Type', 'Date', 'Property', 'Detail', 'Amount'],
        (data.rows || []).map((r: any) => [r.client, r.type, r.date, r.place, r.detail, r.amount.toFixed(2)]),
        { heading: `${membership?.organizationName || 'Portfolio'} — ${monthLabel}` }
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export')
    }
    setExportingMonth(false)
  }

  const handleBulkApprove = async () => {
    if (selectedJobIds.size === 0) return
    setApproving(true)
    try {
      const res = await fetch('/api/pm/jobs/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds: Array.from(selectedJobIds) }),
      })
      const data = await res.json()
      if (res.ok) {
        setPendingJobs((prev) => prev.filter((j) => !selectedJobIds.has(j.id)))
        setSelectedJobIds(new Set())
        await loadAll()
      } else {
        setError(data.error || 'Could not approve those jobs')
      }
    } catch {
      setError('Could not approve those jobs')
    }
    setApproving(false)
  }

  const handleToggleContractorFavorite = async (contractorId: string, isFavorite: boolean) => {
    setContractors((prev) => prev.map((c) => (c.id === contractorId ? { ...c, isFavorite: !isFavorite } : c)))
    await fetch('/api/landlord/favorite-contractors', {
      method: isFavorite ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractorUserId: contractorId }),
    }).catch(() => {})
  }

  const handleFeeChange = async (portfolioId: string, amount: number | null, frequency: 'one_time' | 'monthly') => {
    setClients((prev) => prev.map((c) => (c.id === portfolioId ? { ...c, managementFee: amount, managementFeeFrequency: amount === null ? null : frequency, feeApproved: false } : c)))
    await fetch(`/api/pm/clients/${portfolioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managementFeeType: 'flat', managementFee: amount, managementFeeFrequency: frequency }),
    })
  }

  // Switches a client between a flat dollar fee and a percentage of rent
  // actually collected — the dominant real-world PM billing model, and a
  // real gap against it being flat-only. Always monthly (a percentage of
  // a one-time amount doesn't make sense the way a flat one-time fee
  // does), auto-billed by cron/pm-fee-billing the same way a flat monthly
  // fee now is.
  const handleFeeTypeChange = async (portfolioId: string, type: 'flat' | 'percent_of_rent', percent?: number) => {
    setClients((prev) => prev.map((c) => (c.id === portfolioId ? {
      ...c,
      managementFeeType: type,
      managementFeePercent: type === 'percent_of_rent' ? (percent ?? c.managementFeePercent) : null,
      managementFee: type === 'percent_of_rent' ? null : c.managementFee,
      managementFeeFrequency: type === 'percent_of_rent' ? 'monthly' : c.managementFeeFrequency,
      feeApproved: false,
    } : c)))
    await fetch(`/api/pm/clients/${portfolioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        type === 'percent_of_rent'
          ? { managementFeeType: 'percent_of_rent', managementFeePercent: percent }
          : { managementFeeType: 'flat' }
      ),
    })
  }

  const handleToggleMonthlySummary = async (portfolioId: string, value: boolean) => {
    setClients((prev) => prev.map((c) => (c.id === portfolioId ? { ...c, monthlySummaryEnabled: value } : c)))
    await fetch(`/api/pm/clients/${portfolioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlySummaryEnabled: value }),
    })
  }

  const handleToggleReadOnly = async (portfolioId: string, value: boolean) => {
    setClients((prev) => prev.map((c) => (c.id === portfolioId ? { ...c, ownerReadOnly: value } : c)))
    await fetch(`/api/pm/clients/${portfolioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerReadOnly: value }),
    })
  }

  const handleToggleFinancials = async (memberId: string, value: boolean) => {
    setStaff((prev) => prev.map((s) => (s.id === memberId ? { ...s, canViewFinancials: value } : s)))
    await fetch(`/api/pm/staff/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canViewFinancials: value }),
    })
  }

  const handleSetScopeAllClients = async (memberId: string, value: boolean) => {
    setStaff((prev) => prev.map((s) => (s.id === memberId ? { ...s, scopeAllClients: value } : s)))
    await fetch(`/api/pm/staff/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scopeAllClients: value }),
    })
  }

  const handleToggleAssignedClient = async (memberId: string, ownerUserId: string, assigned: boolean) => {
    const next = staff.find((s) => s.id === memberId)?.assignedOwnerIds || []
    const updated = assigned ? [...next, ownerUserId] : next.filter((id) => id !== ownerUserId)
    setStaff((prev) => prev.map((s) => (s.id === memberId ? { ...s, assignedOwnerIds: updated } : s)))
    await fetch(`/api/pm/staff/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedOwnerIds: updated }),
    })
  }

  const handleSetNotificationMode = async (memberId: string, mode: 'realtime' | 'digest') => {
    setStaff((prev) => prev.map((s) => (s.id === memberId ? { ...s, notificationMode: mode } : s)))
    await fetch(`/api/pm/staff/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationMode: mode }),
    })
  }

  const handleRemoveStaff = async (memberId: string) => {
    await fetch(`/api/pm/staff/${memberId}`, { method: 'DELETE' })
    await loadAll()
  }

  const handleRemoveClient = async (portfolioId: string) => {
    await fetch(`/api/pm/clients/${portfolioId}`, { method: 'DELETE' })
    await loadAll()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0F1C] px-4 py-10">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" />
          <div className="h-32 bg-white/5 rounded-2xl animate-pulse" />
        </div>
      </div>
    )
  }

  const pendingIncoming = incomingInvites.filter((i) => i.status === 'pending')
  const acceptedIncoming = incomingInvites.filter((i) => i.status === 'accepted')
  const acceptedClients = clients.filter((c) => c.status === 'accepted')

  const combinedUnits = acceptedClients.reduce((t, c) => t + (c.unitCount || 0), 0)
  const combinedOpenJobs = acceptedClients.reduce((t, c) => t + (c.openJobCount || 0), 0)
  const combinedRent = acceptedClients.reduce((t, c) => t + (c.rentCollectedThisMonth || 0), 0)

  return (
    <div className="min-h-screen bg-[#0A0F1C] px-4 py-8 pb-24">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Link href="/profile" className="inline-flex items-center gap-1.5 text-white/40 text-sm hover:text-white/70 transition">
            ← Back to profile
          </Link>
          <GoogleTranslateToggle />
        </div>

        <h1 className="text-white font-bold text-2xl mb-1">Property Management</h1>
        <p className="text-white/50 text-sm mb-6">
          {membership ? membership.organizationName : 'Manage every client’s properties from one place.'}
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">{error}</div>
        )}

        {pendingStaffInvite && (
          <ScrollReveal className="bg-[#12A5A9]/10 border border-[#12A5A9]/25 rounded-2xl p-5 mb-6">
            <p className="text-white font-semibold mb-1">{pendingStaffInvite.orgName} invited you to their team</p>
            <p className="text-white/60 text-sm mb-4">
              You'll be able to manage their clients' properties alongside them. You can leave at any time.
            </p>
            <div className="flex gap-3">
              <RippleButton
                onClick={() => handleAcceptStaffInvite(pendingStaffInvite.id)}
                className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-xl"
              >
                Accept
              </RippleButton>
              <RippleButton
                onClick={() => handleDeclineStaffInvite(pendingStaffInvite.id)}
                className="bg-white/5 border border-white/10 text-white/70 text-sm font-semibold px-4 py-2 rounded-xl"
              >
                Decline
              </RippleButton>
            </div>
          </ScrollReveal>
        )}

        {pendingIncoming.length > 0 && (
          <div className="space-y-3 mb-6">
            {pendingIncoming.map((inv) =>
              inv.requestedBy === 'owner' ? (
                <ScrollReveal key={inv.id} className="bg-white/3 border border-white/8 rounded-2xl p-5">
                  <p className="text-white font-semibold mb-1">Waiting on {inv.orgName}</p>
                  <p className="text-white/60 text-sm mb-4">
                    You asked them to manage your property. They'll need to accept from their own dashboard before anything changes.
                  </p>
                  <RippleButton
                    onClick={() => handleDeclineInvite(inv.id)}
                    className="bg-white/5 border border-white/10 text-white/70 text-sm font-semibold px-4 py-2 rounded-xl"
                  >
                    Cancel request
                  </RippleButton>
                </ScrollReveal>
              ) : (
                <ScrollReveal key={inv.id} className="bg-[#12A5A9]/10 border border-[#12A5A9]/25 rounded-2xl p-5">
                  <p className="text-white font-semibold mb-1">{inv.orgName} wants to manage your property</p>
                  <p className="text-white/60 text-sm mb-4">
                    You stay the owner, keep full access, and can remove them at any time. Jobs at or under the limit you set can be approved by them on your behalf; anything above it always waits for you.
                  </p>
                  <label className="block text-white/70 text-xs font-semibold mb-1">Your approval limit</label>
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className="text-white/60 text-sm">$</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={inviteThresholds[inv.id] ?? String(inv.approvalThreshold ?? 0)}
                      onChange={(e) => setInviteThresholds((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                      className="w-28 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                    />
                    <span className="text-white/40 text-xs">Leave at $0 to approve every job yourself. Change it anytime.</span>
                  </div>
                  <div className="flex gap-3">
                    <RippleButton
                      onClick={() => {
                        const parsed = Number(inviteThresholds[inv.id] ?? inv.approvalThreshold ?? 0)
                        handleAcceptInvite(inv.id, Number.isFinite(parsed) && parsed >= 0 ? parsed : 0)
                      }}
                      className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-xl"
                    >
                      Accept
                    </RippleButton>
                    <RippleButton
                      onClick={() => handleDeclineInvite(inv.id)}
                      className="bg-white/5 border border-white/10 text-white/70 text-sm font-semibold px-4 py-2 rounded-xl"
                    >
                      Decline
                    </RippleButton>
                  </div>
                </ScrollReveal>
              )
            )}
          </div>
        )}

        {acceptedIncoming.length > 0 && !membership && (
          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <ShieldIcon className="w-5 h-5 text-[#12A5A9] shrink-0 mt-0.5" />
              <p className="text-white/70 text-sm flex-1">
                Managed by <span className="text-white font-semibold">{acceptedIncoming[0].orgName}</span>.
                {acceptedIncoming[0].ownerReadOnly && ' They handle job approvals and payments for you.'}
              </p>
              {/* The invite-acceptance copy promises "you can remove them at
                  any time" — the DELETE route already lets an owner remove
                  their own relationship, but until now nothing in the UI
                  ever offered that once accepted, only at the pending stage. */}
              <button
                onClick={() => {
                  if (!window.confirm(`Stop ${acceptedIncoming[0].orgName} from managing your property? You can always invite them, or another PM, again later.`)) return
                  handleDeclineInvite(acceptedIncoming[0].id)
                }}
                className="text-white/40 hover:text-red-400 text-xs font-semibold shrink-0 transition"
              >
                Remove manager
              </button>
            </div>

            {/* Found live: the threshold was shown as a read-only number the
                PM admin had set, with no way for the owner to change it —
                inverted from the actual rule, which is that this is the
                owner's own permission grant, not the PM's to set alone. */}
            <div className="mt-4 pt-4 border-t border-white/8">
              <label className="flex items-center gap-2 text-sm text-white/60 flex-wrap">
                Approval threshold: $
                <input
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={acceptedIncoming[0].approvalThreshold}
                  onBlur={(e) => {
                    const v = Number(e.target.value)
                    if (!Number.isNaN(v) && v >= 0 && v !== acceptedIncoming[0].approvalThreshold) handleSetOwnThreshold(v)
                  }}
                  disabled={savingThreshold}
                  className="w-24 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-sm disabled:opacity-50"
                />
                <span className="text-white/40 text-xs">per job — below this, they can approve on your behalf; above it, you decide</span>
              </label>
            </div>

            {/* The dead end the user caught: clicking "Managed by X" led
                nowhere, and the activity feed below has no links either.
                Nothing about this relationship actually hides a managed
                owner's own dashboard or job pages — /landlord and
                /landlord/jobs/[id] already show full detail (photos, bids,
                receipts, schedule) with no PM-specific gating. The gap was
                purely that this page never told anyone that, or linked to
                it. */}
            <div className="flex items-center gap-4 mt-3">
              <Link href="/landlord" className="text-[#12A5A9] text-xs font-semibold hover:underline">
                View your dashboard →
              </Link>
              <Link href="/landlord/jobs" className="text-[#12A5A9] text-xs font-semibold hover:underline">
                View all your jobs →
              </Link>
            </div>
            {(() => {
              const inv = acceptedIncoming[0]
              const hasFee = inv.managementFeeType === 'percent_of_rent' ? (inv.managementFeePercent ?? 0) > 0 : (inv.managementFee ?? 0) > 0
              const recurring = inv.managementFeeFrequency === 'monthly' || inv.managementFeeType === 'percent_of_rent'
              const feeText =
                inv.managementFeeType === 'percent_of_rent'
                  ? `${inv.managementFeePercent}% of rent collected, monthly`
                  : `$${(inv.managementFee ?? 0).toFixed(2)}${inv.managementFeeFrequency === 'monthly' ? ' per month' : ' one time'}`
              return (
                <div className="mt-4 pt-4 border-t border-white/8">
                  <p className="text-white/40 text-xs font-semibold uppercase tracking-wide mb-2">Management fee</p>
                  {!hasFee ? (
                    // Free management, or terms not proposed yet -- say so,
                    // instead of leaving the owner wondering what they owe.
                    <p className="text-white/60 text-sm">No fee set. {inv.orgName} will propose one here if they charge for management, and nothing is ever billed without your approval.</p>
                  ) : !inv.feeApproved ? (
                    // The PM proposed (or changed) terms. Nothing can be
                    // charged until the owner approves this exact amount.
                    <div className="bg-yellow-500/8 border border-yellow-500/25 rounded-xl p-4">
                      <p className="text-white text-sm mb-1">
                        <span className="font-semibold">{inv.orgName}</span> proposed <span className="font-semibold">{feeText}</span>.
                      </p>
                      <p className="text-white/50 text-xs mb-3">
                        Nothing is charged until you approve.{recurring ? ' Once approved, it bills automatically each month to your card on file.' : ''} Don&apos;t agree? Leave it unapproved and talk it over with them.
                      </p>
                      <RippleButton
                        onClick={() => handleApproveFee(inv)}
                        disabled={approvingFee}
                        className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-xl disabled:opacity-50"
                      >
                        {approvingFee ? 'Approving…' : 'Approve this fee'}
                      </RippleButton>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-white text-sm font-semibold">
                          {feeText} <span className="text-[#12A5A9] text-xs font-semibold ml-1">✓ Approved by you</span>
                        </p>
                        <RippleButton
                          onClick={() => handlePayFee(inv.id)}
                          disabled={payingFee}
                          className="bg-white/5 border border-white/10 text-white/80 text-xs font-semibold px-4 py-2 rounded-xl disabled:opacity-50 whitespace-nowrap"
                        >
                          {payingFee ? 'Starting…' : 'Pay now'}
                        </RippleButton>
                      </div>
                      {recurring && (
                        <p className="text-white/30 text-xs mt-2">
                          Billed automatically each month to your{' '}
                          <Link href="/profile" className="text-[#12A5A9] hover:underline">card on file</Link>
                          {' '}— no need to pay manually unless a charge fails. If {inv.orgName} changes this fee, billing pauses until you approve the new amount.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )
            })()}
            {feePayError && <p className="text-red-400 text-xs mt-2">{feePayError}</p>}
          </ScrollReveal>
        )}

        {/* The owner's own side of the relationship: what's actually
            happening on their property under this company's management,
            not an unrelated "start your own PM company" upsell -- that
            card used to show here unconditionally, which made no sense
            for someone who's already being managed by someone else. */}
        {myStatus && (
          <div className="mb-6">
            <h2 className="text-white font-semibold mb-3">Your property, managed</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatTile icon={BuildingIcon} label="Properties" value={myStatus.propertyCount} />
              <StatTile icon={BuildingIcon} label="Units" value={myStatus.unitCount} />
              <StatTile icon={WrenchIcon} label="Open jobs" value={myStatus.openJobCount} />
            </div>
            {myStatus.entries.length === 0 ? (
              <p className="text-white/30 text-sm">No activity from them yet.</p>
            ) : (
              <div className="space-y-2">
                {myStatus.entries.map((entry) => {
                  // Clickable straight through to the same job-detail page
                  // a non-managed landlord would see — photos, bids,
                  // receipts, schedule, nothing PM-specific withheld.
                  // Previously this feed was plain text with nowhere to go,
                  // which is what made the whole page feel like a dead end.
                  const content = (
                    <>
                      <span className="text-white/80">{entry.actorName}</span> {ACTION_LABELS[entry.action] || entry.action}
                      {entry.detail && <span className="text-white/60">: {entry.detail}</span>}
                      {entry.amount !== null && <span className="text-white/60"> · ${entry.amount.toFixed(2)}</span>}
                      <span className="text-white/30"> · {new Date(entry.createdAt).toLocaleDateString()}</span>
                      {entry.jobId && <span className="text-[#12A5A9] text-xs font-semibold ml-1">View job →</span>}
                    </>
                  )
                  return entry.jobId ? (
                    <Link
                      key={entry.id}
                      href={`/landlord/jobs/${entry.jobId}`}
                      className="block bg-white/3 border border-white/8 hover:border-[#12A5A9]/30 hover:bg-white/5 rounded-xl px-4 py-3 text-xs text-white/50 transition"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div key={entry.id} className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-xs text-white/50">
                      {content}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {!membership && !myStatus && (
          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-7 text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center mx-auto mb-4">
              <BuildingIcon className="w-5 h-5 text-[#12A5A9]" />
            </div>
            <h2 className="text-white font-semibold mb-2">Run a property management company?</h2>
            <p className="text-white/50 text-sm mb-5 max-w-sm mx-auto">
              Give your company its own name to get started. You can invite your first client right after.
            </p>
            <div className="flex gap-2 max-w-sm mx-auto">
              <input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Company name"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50"
              />
              <RippleButton
                onClick={handleCreateOrg}
                disabled={creating || !orgName.trim()}
                className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 whitespace-nowrap"
              >
                {creating ? 'Creating…' : 'Create'}
              </RippleButton>
            </div>
          </ScrollReveal>
        )}

        {membership && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatTile icon={BuildingIcon} label="Units managed" value={<CountUp value={combinedUnits} />} onClick={() => setActiveTab('clients')} />
              <StatTile icon={WrenchIcon} label="Open jobs" value={<CountUp value={combinedOpenJobs} />} onClick={() => setActiveTab('clients')} />
              {membership.canViewFinancials ? (
                <StatTile icon={DollarSignIcon} label="Rent this month" value={`$${combinedRent.toFixed(0)}`} onClick={() => setActiveTab('clients')} />
              ) : (
                <StatTile icon={ShieldIcon} label="Your role" value="Staff" />
              )}
            </div>


            <TabBar
              active={activeTab}
              onChange={setActiveTab}
              tabs={[
                { key: 'overview', label: 'Overview' },
                { key: 'clients', label: 'Clients', count: clients.length },
                { key: 'team', label: 'Team', count: staff.length },
                { key: 'activity', label: 'Activity' },
              ]}
            />

            {activeTab === 'overview' && (
              <>
                {membership.memberRole === 'admin' &&
                  !checklistDismissed &&
                  !(clients.some((c) => c.status === 'accepted') && payoutStatus === 'active' && openToClients) && (
                    <ScrollReveal className="bg-gradient-to-br from-[#0A7B7E]/15 via-white/3 to-white/3 border border-[#12A5A9]/25 rounded-2xl p-5 mb-6">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <h2 className="text-white font-semibold">Get started</h2>
                        <button onClick={dismissChecklist} aria-label="Dismiss" className="text-white/40 hover:text-white text-sm">
                          ×
                        </button>
                      </div>
                      <div className="space-y-2">
                        <ChecklistRow
                          done={clients.some((c) => c.status === 'accepted')}
                          label="Invite your first client"
                          onClick={() => setActiveTab('clients')}
                        />
                        <ChecklistRow done={payoutStatus === 'active'} label="Set up payouts" href="/profile#billing" />
                        <ChecklistRow done={openToClients} label="Turn on your public profile" anchor="get-found" />
                      </div>
                    </ScrollReveal>
                  )}

                {membership.canViewFinancials && (
                  <button
                    onClick={handleExportMonth}
                    disabled={exportingMonth}
                    className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-xs font-semibold mb-6 transition disabled:opacity-50"
                  >
                    <DownloadIcon className="w-3.5 h-3.5" />
                    {exportingMonth ? 'Exporting…' : 'Export this month, every client (CSV)'}
                  </button>
                )}

                {membership.canViewFinancials && months.length > 0 && <RentTrendChart months={months} />}

                {complianceAlerts.length > 0 && (
                  <ScrollReveal id="compliance-alerts" className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6 scroll-mt-6">
                    <h2 className="text-white font-semibold mb-3">
                      Compliance <span className="text-white/30 font-normal">({complianceAlerts.length})</span>
                    </h2>
                    <p className="text-white/30 text-xs mb-3">Licenses and inspections expiring soon across every client.</p>
                    <div className="space-y-2">
                      {complianceAlerts.map((a) => (
                        <Link
                          key={a.id}
                          href={`/landlord/properties/${a.propertyId}/compliance`}
                          className="flex items-center gap-3 bg-white/4 rounded-xl px-3.5 py-2.5 hover:bg-white/8 transition"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-white text-sm truncate">
                              {a.itemType} <span className="text-white/40">· {a.address}</span>
                            </p>
                            <p className="text-white/30 text-xs">{a.ownerName}</p>
                          </div>
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                              a.daysUntil < 0 ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'
                            }`}
                          >
                            {a.daysUntil < 0 ? 'Expired' : `${a.daysUntil}d left`}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </ScrollReveal>
                )}

                {pendingJobs.length > 0 && (
                  <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-white font-semibold">
                        Pending approvals <span className="text-white/30 font-normal">({pendingJobs.length})</span>
                      </h2>
                      <RippleButton
                        onClick={handleBulkApprove}
                        disabled={selectedJobIds.size === 0 || approving}
                        className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-xl disabled:opacity-50 whitespace-nowrap"
                      >
                        {approving ? 'Approving…' : `Approve selected (${selectedJobIds.size})`}
                      </RippleButton>
                    </div>
                    <p className="text-white/30 text-xs mb-3">Completed work across every client, waiting on your review. Select the ones you've checked and approve them all at once.</p>
                    <div className="space-y-2">
                      {pendingJobs.map((j) => (
                        <label key={j.id} className="flex items-center gap-3 bg-white/4 rounded-xl px-3 py-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedJobIds.has(j.id)}
                            onChange={(e) => {
                              setSelectedJobIds((prev) => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(j.id)
                                else next.delete(j.id)
                                return next
                              })
                            }}
                            className="accent-[#12A5A9]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-white text-sm truncate">
                              {j.category} <span className="text-white/40">· {j.address}</span>
                            </p>
                            <p className="text-white/30 text-xs">{j.ownerName}</p>
                          </div>
                          <Link href={`/landlord/jobs/${j.id}`} className="text-[#12A5A9] text-xs font-semibold hover:underline shrink-0">
                            View
                          </Link>
                        </label>
                      ))}
                    </div>
                  </ScrollReveal>
                )}

                {pendingJobs.length === 0 && (
                  <p className="text-white/30 text-sm mb-6">No pending approvals. Nothing across your portfolio needs your review right now.</p>
                )}

                {membership.memberRole === 'admin' && payoutStatus && payoutStatus !== 'active' && (
                  <ScrollReveal className="bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-4 py-3 mb-6 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-yellow-400/90 text-xs">Set up payouts to collect management fees from clients.</p>
                    <Link href="/profile#billing" className="text-yellow-400 text-xs font-semibold hover:underline whitespace-nowrap">
                      Set up on Profile →
                    </Link>
                  </ScrollReveal>
                )}

                {membership.memberRole === 'admin' && (
                  <div id="get-found" className="bg-white/3 border border-white/8 rounded-2xl p-5">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <h2 className="text-white font-semibold">Get found on Prophandld</h2>
                      <label className="flex items-center gap-2 text-xs text-white/50 shrink-0">
                        <input
                          type="checkbox"
                          checked={openToClients}
                          onChange={(e) => handleToggleOpenToClients(e.target.checked)}
                          disabled={savingProfile}
                          className="accent-[#12A5A9]"
                        />
                        Open to new clients
                      </label>
                    </div>
                    <p className="text-white/40 text-xs mb-4">
                      Turn this on to get a public profile landlords can find and share, and to show up in the property manager directory.
                    </p>
                    <label className="block text-xs text-white/50 mb-1.5">One-line pitch</label>
                    <div className="flex gap-2 mb-3">
                      <input
                        value={pitch}
                        onChange={(e) => setPitch(e.target.value)}
                        onBlur={handleSavePitch}
                        maxLength={280}
                        placeholder="What makes your company worth hiring?"
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50"
                      />
                    </div>
                    {/* Trust & credibility — the fields real landlords say they
                        actually check before picking a PM (license/insurance,
                        service area, track record, specialties, pricing),
                        none of which this profile had before. All optional:
                        an admin who skips these just keeps the plain pitch +
                        rating profile that existed before. */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs text-white/50 mb-1.5">License number</label>
                        <input
                          value={licenseNumber}
                          onChange={(e) => setLicenseNumber(e.target.value)}
                          onBlur={() => saveProfileField('licenseNumber', licenseNumber)}
                          maxLength={60}
                          placeholder="e.g. RB-123456"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-white/50 mb-1.5">Years in business</label>
                        <input
                          type="number"
                          min={0}
                          max={200}
                          value={yearsInBusiness}
                          onChange={(e) => setYearsInBusiness(e.target.value === '' ? '' : Number(e.target.value))}
                          onBlur={() => saveProfileField('yearsInBusiness', yearsInBusiness === '' ? null : yearsInBusiness)}
                          placeholder="e.g. 8"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50"
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-white/60 mb-3">
                      <input
                        type="checkbox"
                        checked={insured}
                        onChange={(e) => { setInsured(e.target.checked); saveProfileField('insured', e.target.checked) }}
                        className="accent-[#12A5A9]"
                      />
                      Carries general liability + E&O insurance
                    </label>
                    <label className="block text-xs text-white/50 mb-1.5">Specialties</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {Object.entries(SPECIALTY_LABELS).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleToggleSpecialty(key)}
                          className={
                            specialties.includes(key)
                              ? 'text-xs font-semibold px-3 py-1.5 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white'
                              : 'text-xs font-semibold px-3 py-1.5 rounded-full bg-white/5 text-white/50 hover:bg-white/8 transition'
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="block text-xs text-white/50 mb-1.5">Service area (zip codes)</label>
                    <input
                      value={serviceZipsText}
                      onChange={(e) => setServiceZipsText(e.target.value)}
                      onBlur={handleSaveServiceZips}
                      placeholder="e.g. 19102, 19103, 19104"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50 mb-3"
                    />
                    <label className="block text-xs text-white/50 mb-1.5">Typical pricing (shown to prospective clients)</label>
                    <input
                      value={pricingNote}
                      onChange={(e) => setPricingNote(e.target.value)}
                      onBlur={() => saveProfileField('pricingNote', pricingNote)}
                      maxLength={120}
                      placeholder="e.g. 8-10% of monthly rent, or $150/unit/month"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50 mb-4"
                    />

                    <div className="border-t border-white/8 pt-4 mb-4">
                      <p className="text-white text-sm font-semibold mb-3">Look &amp; feel</p>
                      <div className="flex items-start gap-4 flex-wrap mb-3">
                        <div>
                          <p className="text-xs text-white/50 mb-1.5">Logo</p>
                          <div className="flex items-center gap-2">
                            <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                              {logoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logoUrl} alt="Your logo" className="w-full h-full object-cover" />
                              ) : (
                                <BuildingIcon className="w-5 h-5 text-white/30" />
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[#12A5A9] text-xs font-semibold cursor-pointer hover:underline">
                                {brandingBusy === 'logo' ? 'Uploading…' : logoUrl ? 'Replace' : 'Upload'}
                                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={brandingBusy !== null} onChange={(e) => { handleBrandingUpload('logo', e.target.files?.[0]); e.target.value = '' }} />
                              </label>
                              {logoUrl && <button type="button" onClick={() => handleBrandingRemove('logo')} className="text-white/40 hover:text-red-400 text-xs text-left">Remove</button>}
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 min-w-[180px]">
                          <p className="text-xs text-white/50 mb-1.5">Cover photo</p>
                          <div className="flex items-center gap-2">
                            <div className="h-14 flex-1 rounded-xl bg-white/5 border border-white/10 overflow-hidden" style={coverUrl ? undefined : brandColor ? { background: brandColor } : undefined}>
                              {coverUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={coverUrl} alt="Your cover" className="w-full h-full object-cover" />
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[#12A5A9] text-xs font-semibold cursor-pointer hover:underline">
                                {brandingBusy === 'cover' ? 'Uploading…' : coverUrl ? 'Replace' : 'Upload'}
                                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={brandingBusy !== null} onChange={(e) => { handleBrandingUpload('cover', e.target.files?.[0]); e.target.value = '' }} />
                              </label>
                              {coverUrl && <button type="button" onClick={() => handleBrandingRemove('cover')} className="text-white/40 hover:text-red-400 text-xs text-left">Remove</button>}
                            </div>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-white/50 mb-1.5">Brand color</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {['#12A5A9', '#2563EB', '#16A34A', '#9333EA', '#DC2626', '#EA580C', '#CA8A04', '#0F172A'].map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            aria-label={`Use ${hex}`}
                            onClick={() => { setBrandColor(hex); saveProfileField('brandColor', hex) }}
                            className={`w-7 h-7 rounded-full border-2 transition ${brandColor?.toUpperCase() === hex ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
                            style={{ background: hex }}
                          />
                        ))}
                        <label className="w-7 h-7 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center cursor-pointer text-white/50 text-xs" title="Custom color">
                          +
                          <input
                            type="color"
                            className="sr-only"
                            value={brandColor || '#12A5A9'}
                            onChange={(e) => setBrandColor(e.target.value)}
                            onBlur={(e) => saveProfileField('brandColor', e.target.value)}
                          />
                        </label>
                        {brandColor && (
                          <button type="button" onClick={() => { setBrandColor(null); saveProfileField('brandColor', null) }} className="text-white/40 hover:text-white text-xs ml-1">
                            Reset
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-white/8 pt-4 mb-4">
                      <label htmlFor="pm-about" className="block text-white text-sm font-semibold mb-1">About your company</label>
                      <p className="text-white/40 text-xs mb-1.5">Your story, what you&apos;re great at, how you work with owners. Shown on your public profile.</p>
                      <textarea
                        id="pm-about"
                        value={about}
                        onChange={(e) => setAbout(e.target.value.slice(0, 2000))}
                        onBlur={() => saveProfileField('about', about)}
                        rows={4}
                        placeholder="e.g. Family-run since 2012. We manage 140 doors across Northeast Philly, answer every call within the hour, and send owners a clear statement every month."
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50 resize-none"
                      />
                      <p className="text-white/30 text-[11px] text-right">{about.length}/2000</p>
                    </div>

                    <div className="border-t border-white/8 pt-4 mb-4">
                      <p className="text-white text-sm font-semibold mb-2">How owners can reach you</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="pm-website" className="block text-xs text-white/50 mb-1">Website</label>
                          <input id="pm-website" value={website} onChange={(e) => setWebsite(e.target.value)} onBlur={() => saveProfileField('website', website)} placeholder="yourcompany.com" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50" />
                        </div>
                        <div>
                          <label htmlFor="pm-phone" className="block text-xs text-white/50 mb-1">Phone</label>
                          <input id="pm-phone" type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} onBlur={() => saveProfileField('contactPhone', contactPhone)} placeholder="(215) 555-0123" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50" />
                        </div>
                        <div>
                          <label htmlFor="pm-email" className="block text-xs text-white/50 mb-1">Email</label>
                          <input id="pm-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} onBlur={() => saveProfileField('contactEmail', contactEmail)} placeholder="hello@yourcompany.com" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50" />
                        </div>
                        <div>
                          <label htmlFor="pm-hours" className="block text-xs text-white/50 mb-1">Office hours</label>
                          <input id="pm-hours" value={officeHours} onChange={(e) => setOfficeHours(e.target.value)} onBlur={() => saveProfileField('officeHours', officeHours)} maxLength={200} placeholder="Mon–Fri 9–5, emergencies 24/7" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50" />
                        </div>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-white/60 mb-4">
                      <input type="checkbox" checked={showTeam} onChange={(e) => { setShowTeam(e.target.checked); saveProfileField('showTeam', e.target.checked) }} className="accent-[#12A5A9]" />
                      Show my team on the profile (names and roles only)
                    </label>

                    {profileMsg && (
                      <p className={`text-xs mb-3 ${profileMsg.tone === 'ok' ? 'text-[#12A5A9]' : 'text-red-400'}`}>{profileMsg.text}</p>
                    )}

                    {openToClients && profileSlug && (
                      <>
                        <div className="flex items-center gap-2 flex-wrap mb-3">
                          <Link href={`/property-managers/${profileSlug}`} className="text-[#12A5A9] text-xs font-semibold hover:underline" target="_blank">
                            View your profile →
                          </Link>
                          <button onClick={handleCopyProfileLink} className="text-white/50 hover:text-white text-xs font-semibold">
                            {profileCopied ? 'Copied!' : 'Copy share link'}
                          </button>
                        </div>
                        <p className="text-white/30 text-xs">
                          {viewsThisMonth} view{viewsThisMonth === 1 ? '' : 's'} this month · {viewsTotal} all-time
                        </p>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {activeTab === 'clients' && (
              <>
                {clients.length === 0 ? (
                  <p className="text-white/40 text-sm mb-4">No clients invited yet.</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {clients.map((c) => {
                      const hasPending = pendingJobs.some((j) => j.ownerUserId === c.ownerUserId)
                      return (
                        <div key={c.id} className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpandedClient((cur) => (cur === c.id ? null : c.id))}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {c.status === 'accepted' && (
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${hasPending ? 'bg-yellow-400' : 'bg-[#12A5A9]'}`}
                                  title={hasPending ? 'Needs approval' : 'Up to date'}
                                />
                              )}
                              <span className="text-white text-sm font-medium truncate">{c.ownerName}</span>
                              <StatusPill status={c.status} />
                            </div>
                            {c.status === 'accepted' && (
                              <ChevronDownIcon className={`w-4 h-4 text-white/30 shrink-0 transition-transform ${expandedClient === c.id ? 'rotate-180' : ''}`} />
                            )}
                          </button>

                          {c.status === 'pending' && c.requestedBy === 'owner' && membership.memberRole === 'admin' && (
                            <div className="px-4 pb-4 border-t border-white/8 pt-3">
                              <p className="text-white/50 text-xs mb-3">
                                {c.ownerName} found your public profile and asked you to manage their property.
                              </p>
                              <div className="flex gap-2">
                                <RippleButton
                                  onClick={() => handleAcceptOwnerRequest(c.id)}
                                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg"
                                >
                                  Accept
                                </RippleButton>
                                <button onClick={() => handleDeclineInvite(c.id)} className="text-white/50 hover:text-white text-xs font-semibold px-2">
                                  Decline
                                </button>
                              </div>
                            </div>
                          )}

                          {c.status === 'accepted' && expandedClient === c.id && (
                            <div className="px-4 pb-4 border-t border-white/8 pt-3">
                              {/* Previously these were plain counts with no
                                  way to see WHICH properties or WHICH jobs
                                  — a PM managing several clients had no path
                                  from "2 properties, 1 open job" to actually
                                  seeing them. Both shared list pages already
                                  support an owner-scoped view; this just
                                  links into it. */}
                              <div className="grid grid-cols-3 gap-2 mb-3">
                                <StatTile icon={BuildingIcon} label="Properties" value={c.propertyCount ?? 0} onClick={() => router.push(`/landlord/properties?owner=${c.ownerUserId}`)} />
                                <StatTile icon={WrenchIcon} label="Open jobs" value={c.openJobCount ?? 0} onClick={() => router.push(`/landlord/jobs?owner=${c.ownerUserId}&filter=all`)} />
                                {membership.canViewFinancials ? (
                                  <StatTile icon={DollarSignIcon} label="Rent this month" value={`$${(c.rentCollectedThisMonth || 0).toFixed(0)}`} />
                                ) : (
                                  <StatTile icon={BuildingIcon} label="Units" value={c.unitCount ?? 0} onClick={() => router.push(`/landlord/properties?owner=${c.ownerUserId}`)} />
                                )}
                              </div>
                              {/* Set up the client the same way a landlord sets up
                                  themselves: add a property (owned by the client),
                                  then units, tenants and jobs from that property. */}
                              <div className="flex items-center gap-2 flex-wrap mb-3">
                                <Link
                                  href={`/landlord/properties/new?for=${c.id}`}
                                  className="inline-flex items-center gap-1.5 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition"
                                >
                                  <PlusIcon className="w-3.5 h-3.5" /> Add property
                                </Link>
                                <Link
                                  href={`/landlord/properties?owner=${c.ownerUserId}`}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white transition"
                                >
                                  Units &amp; tenants
                                </Link>
                              </div>
                              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                                {/* Read-only for the PM: the approval limit is the
                                    owner's own permission grant, set and changed only
                                    by them (locked product rule). */}
                                <span className="text-xs text-white/50">
                                  {c.approvalThreshold > 0
                                    ? <>You can approve jobs up to <span className="text-white font-semibold">${c.approvalThreshold.toFixed(0)}</span> <span className="text-white/30">(set by {c.ownerName})</span></>
                                    : <>Every job needs {c.ownerName}&apos;s approval <span className="text-white/30">(their setting)</span></>}
                                </span>
                                <div className="flex items-center gap-3">
                                  {membership.canViewFinancials && (
                                    <Link href={`/landlord/pm/clients/${c.id}/statement`} className="text-[#12A5A9] text-xs font-semibold hover:underline">
                                      Statement
                                    </Link>
                                  )}
                                  {membership.memberRole === 'admin' && (
                                    <button onClick={() => handleRemoveClient(c.id)} className="text-red-400/70 hover:text-red-400 text-xs">
                                      Remove
                                    </button>
                                  )}
                                </div>
                              </div>
                              {membership.memberRole === 'admin' && (
                                <div className="flex items-center gap-2 text-xs text-white/50 flex-wrap">
                                  Management fee:
                                  <select
                                    value={c.managementFeeType}
                                    onChange={(e) => {
                                      const type = e.target.value as 'flat' | 'percent_of_rent'
                                      if (type === 'percent_of_rent') {
                                        handleFeeTypeChange(c.id, 'percent_of_rent', c.managementFeePercent || 10)
                                      } else {
                                        handleFeeTypeChange(c.id, 'flat')
                                      }
                                    }}
                                    className="bg-white/5 border border-white/10 rounded-lg px-1.5 py-1 text-white text-xs"
                                  >
                                    <option value="flat" className="bg-[#0C1A2E]">Flat $</option>
                                    <option value="percent_of_rent" className="bg-[#0C1A2E]">% of rent collected</option>
                                  </select>
                                  {c.managementFeeType === 'percent_of_rent' ? (
                                    <label className="flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        min={0.1}
                                        max={100}
                                        step={0.1}
                                        defaultValue={c.managementFeePercent ?? 10}
                                        onBlur={(e) => {
                                          // Saving re-proposes the fee to the owner (clears their
                                          // approval, emails them) -- so a click-in/click-out with
                                          // no actual change must never trigger it.
                                          const next = Number(e.target.value) || 10
                                          if (next !== c.managementFeePercent) handleFeeTypeChange(c.id, 'percent_of_rent', next)
                                        }}
                                        className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs"
                                      />
                                      % of rent collected, billed monthly
                                    </label>
                                  ) : (
                                    <label className="flex items-center gap-1.5">
                                      $
                                      <input
                                        type="number"
                                        defaultValue={c.managementFee ?? ''}
                                        placeholder="none"
                                        onBlur={(e) => {
                                          const v = e.target.value.trim()
                                          const next = v === '' ? null : Number(v) || 0
                                          if (next !== c.managementFee) handleFeeChange(c.id, next, c.managementFeeFrequency || 'monthly')
                                        }}
                                        className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs"
                                      />
                                      {c.managementFee !== null && (
                                        <select
                                          value={c.managementFeeFrequency || 'monthly'}
                                          onChange={(e) => handleFeeChange(c.id, c.managementFee, e.target.value as 'one_time' | 'monthly')}
                                          className="bg-white/5 border border-white/10 rounded-lg px-1.5 py-1 text-white text-xs"
                                        >
                                          <option value="monthly" className="bg-[#0C1A2E]">/month</option>
                                          <option value="one_time" className="bg-[#0C1A2E]">one time</option>
                                        </select>
                                      )}
                                    </label>
                                  )}
                                  {(c.managementFeeType === 'percent_of_rent' ? (c.managementFeePercent ?? 0) > 0 : (c.managementFee ?? 0) > 0) && (
                                    <span className={`w-full text-xs font-semibold ${c.feeApproved ? 'text-[#12A5A9]' : 'text-yellow-400/90'}`}>
                                      {c.feeApproved
                                        ? `✓ ${c.ownerName} approved this fee`
                                        : `Waiting for ${c.ownerName} to approve — nothing is charged until they do. They've been notified.`}
                                    </span>
                                  )}
                                  <span className="text-white/30 w-full">
                                    Proposed to {c.ownerName}, paid to you directly once approved.
                                    {(c.managementFeeFrequency === 'monthly' || c.managementFeeType === 'percent_of_rent') && ' Then charged automatically each month if they have a card on file.'}
                                    {' '}Changing it sends them a new proposal to approve.
                                  </span>
                                </div>
                              )}
                              {membership.memberRole === 'admin' && (
                                <div className="flex items-center gap-2 flex-wrap mt-2">
                                  <label className="flex items-center gap-2 text-xs text-white/50">
                                    <input
                                      type="checkbox"
                                      checked={c.monthlySummaryEnabled}
                                      onChange={(e) => handleToggleMonthlySummary(c.id, e.target.checked)}
                                      className="accent-[#12A5A9]"
                                    />
                                    Email {c.ownerName} a monthly summary (rent collected, maintenance paid)
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => openSummaryEditor(c)}
                                    className="text-[#12A5A9] text-xs font-semibold hover:underline"
                                  >
                                    Preview &amp; customize
                                  </button>
                                </div>
                              )}
                              {membership.memberRole === 'admin' && (
                                <div className="mt-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {/* Label matches what this actually does today: the
                                        one enforced effect is that the owner can't pay
                                        contractor jobs themselves (see
                                        isBlockedByOwnerReadOnly). The old label promised
                                        "job approvals and payments". */}
                                    <label className="flex items-center gap-2 text-xs text-white/50">
                                      <input
                                        type="checkbox"
                                        checked={c.ownerReadOnly}
                                        onChange={(e) => handleToggleReadOnly(c.id, e.target.checked)}
                                        className="accent-[#12A5A9]"
                                      />
                                      You pay contractors for {c.ownerName}&apos;s jobs (hands-off mode)
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => setReadOnlyPreviewFor((cur) => (cur === c.id ? null : c.id))}
                                      className="text-[#12A5A9] text-xs font-semibold hover:underline"
                                    >
                                      {readOnlyPreviewFor === c.id ? 'Hide' : `What ${c.ownerName} sees`}
                                    </button>
                                  </div>
                                  {readOnlyPreviewFor === c.id && (
                                    <div className="mt-2 bg-white/4 border border-white/10 rounded-xl p-3 text-xs text-white/60 space-y-1.5">
                                      <p className="text-white/80 font-semibold">With hands-off mode {c.ownerReadOnly ? 'on' : 'turned on'}, {c.ownerName}:</p>
                                      <p>✓ Still sees every property, job, photo, bid and receipt, nothing is hidden</p>
                                      <p>✓ Still approves anything above their own approval limit</p>
                                      <p>✗ Can&apos;t pay contractors directly. If they try, they&apos;re told: &ldquo;Your property manager handles payments for this property.&rdquo;</p>
                                      <p className="text-white/40">They&apos;re notified when you turn this on or off.</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {membership.memberRole === 'admin' && (
                  <Collapsible label="Invite a client" icon={PlusIcon}>
                    <p className="text-white/40 text-xs mb-3">Enter the email of an existing landlord account on Prophandld.</p>
                    <div className="flex gap-2">
                      <input
                        value={clientEmail}
                        onChange={(e) => setClientEmail(e.target.value)}
                        placeholder="landlord@email.com"
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50"
                      />
                      <RippleButton
                        onClick={handleInviteClient}
                        disabled={invitingClient}
                        className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 whitespace-nowrap"
                      >
                        {invitingClient ? 'Sending…' : 'Invite'}
                      </RippleButton>
                    </div>
                    {clientInviteMsg && <p className="text-white/50 text-xs mt-2">{clientInviteMsg}</p>}
                  </Collapsible>
                )}

                {contractors.length > 0 && (
                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => setShowContractors((v) => !v)}
                      className="flex items-center gap-1.5 text-white/50 text-sm font-semibold hover:text-white/80 transition mb-3"
                    >
                      Contractor network <span className="text-white/30 font-normal">({contractors.length})</span>{' '}
                      <ChevronDownIcon className={`w-4 h-4 transition-transform ${showContractors ? 'rotate-180' : ''}`} />
                    </button>
                    <p className="text-white/30 text-xs mb-3">
                      Everyone your team has hired across every client, so you can reuse someone reliable without re-inviting them for each portfolio.
                    </p>
                    {showContractors && (
                      <div className="space-y-2">
                        {contractors.map((c) => (
                          <div key={c.id} className="bg-white/3 border border-white/8 rounded-xl p-4 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-white text-sm font-medium truncate">{c.name}</p>
                                {c.categories.length > 0 && <span className="text-white/40 text-xs capitalize">{c.categories.join(', ')}</span>}
                              </div>
                              <p className="text-white/30 text-xs mt-0.5">
                                {c.jobsCount} job{c.jobsCount === 1 ? '' : 's'} · ${c.totalPaid.toFixed(0)} paid
                                {c.lastClientAddress ? ` · last at ${c.lastClientAddress}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <button
                                onClick={() => handleToggleContractorFavorite(c.id, c.isFavorite)}
                                aria-label={c.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                                className={c.isFavorite ? 'text-yellow-400' : 'text-white/30 hover:text-white/60'}
                              >
                                <StarIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleMessageContractor(c)}
                                disabled={messagingContractorId === c.id}
                                className="text-[#12A5A9] text-xs font-semibold hover:underline disabled:opacity-50"
                              >
                                Message
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {activeTab === 'team' && (
              <>
                <div className="space-y-2 mb-4">
                  {staff.map((s) => {
                    const canExpand = membership.memberRole === 'admin' && s.memberRole === 'staff' && s.status === 'accepted'
                    return (
                      <div key={s.id} className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
                        <div className="p-4 flex items-center justify-between gap-3">
                          <button
                            type="button"
                            disabled={!canExpand}
                            onClick={() => canExpand && setExpandedStaff((cur) => (cur === s.id ? null : s.id))}
                            className="min-w-0 flex items-center gap-2.5 text-left flex-1"
                          >
                            <p className="text-white text-sm font-medium truncate">{s.name}</p>
                            <span className="text-white/40 text-xs capitalize">{s.memberRole}</span>
                            {s.status === 'pending' && <StatusPill status="pending" />}
                            {!s.scopeAllClients && <span className="text-xs text-yellow-400">Scoped</span>}
                            {s.notificationMode === 'digest' && <span className="text-xs text-white/30">Digest</span>}
                          </button>
                          {membership.memberRole === 'admin' && s.memberRole === 'staff' && (
                            <div className="flex items-center gap-3 shrink-0">
                              <label className="flex items-center gap-1.5 text-xs text-white/50">
                                <input
                                  type="checkbox"
                                  checked={s.canViewFinancials}
                                  onChange={(e) => handleToggleFinancials(s.id, e.target.checked)}
                                  className="accent-[#12A5A9]"
                                />
                                Financials
                              </label>
                              <button onClick={() => handleRemoveStaff(s.id)} className="text-red-400/70 hover:text-red-400 text-xs">
                                Remove
                              </button>
                              {canExpand && (
                                <ChevronDownIcon
                                  className={`w-4 h-4 text-white/30 transition-transform ${expandedStaff === s.id ? 'rotate-180' : ''}`}
                                />
                              )}
                            </div>
                          )}
                        </div>

                        {canExpand && expandedStaff === s.id && (
                          <div className="px-4 pb-4 border-t border-white/8 pt-3 space-y-4">
                            <div>
                              <p className="text-white/70 text-xs font-semibold mb-2">Client access</p>
                              <div className="flex gap-4 mb-2">
                                <label className="flex items-center gap-1.5 text-xs text-white/60">
                                  <input
                                    type="radio"
                                    checked={s.scopeAllClients}
                                    onChange={() => handleSetScopeAllClients(s.id, true)}
                                    className="accent-[#12A5A9]"
                                  />
                                  All clients
                                </label>
                                <label className="flex items-center gap-1.5 text-xs text-white/60">
                                  <input
                                    type="radio"
                                    checked={!s.scopeAllClients}
                                    onChange={() => handleSetScopeAllClients(s.id, false)}
                                    className="accent-[#12A5A9]"
                                  />
                                  Specific clients
                                </label>
                              </div>
                              {!s.scopeAllClients && (
                                <div className="space-y-1.5 bg-white/[0.03] rounded-xl p-3">
                                  {clients.filter((c) => c.status === 'accepted').length === 0 ? (
                                    <p className="text-white/30 text-xs">No accepted clients yet.</p>
                                  ) : (
                                    clients
                                      .filter((c) => c.status === 'accepted')
                                      .map((c) => (
                                        <label key={c.ownerUserId} className="flex items-center gap-2 text-xs text-white/60">
                                          <input
                                            type="checkbox"
                                            checked={s.assignedOwnerIds.includes(c.ownerUserId)}
                                            onChange={(e) => handleToggleAssignedClient(s.id, c.ownerUserId, e.target.checked)}
                                            className="accent-[#12A5A9]"
                                          />
                                          {c.ownerName}
                                        </label>
                                      ))
                                  )}
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-white/70 text-xs font-semibold mb-2">Notifications</p>
                              <div className="flex gap-4">
                                <label className="flex items-center gap-1.5 text-xs text-white/60">
                                  <input
                                    type="radio"
                                    checked={s.notificationMode === 'realtime'}
                                    onChange={() => handleSetNotificationMode(s.id, 'realtime')}
                                    className="accent-[#12A5A9]"
                                  />
                                  Real-time
                                </label>
                                <label className="flex items-center gap-1.5 text-xs text-white/60">
                                  <input
                                    type="radio"
                                    checked={s.notificationMode === 'digest'}
                                    onChange={() => handleSetNotificationMode(s.id, 'digest')}
                                    className="accent-[#12A5A9]"
                                  />
                                  Daily digest
                                </label>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {staff.length === 0 && <p className="text-white/40 text-sm">No teammates yet.</p>}
                </div>

                {membership.memberRole === 'admin' && (
                  <Collapsible label="Invite staff" icon={PlusIcon}>
                    <div className="flex gap-2 mb-2">
                      <input
                        value={staffEmail}
                        onChange={(e) => setStaffEmail(e.target.value)}
                        placeholder="teammate@email.com"
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50"
                      />
                      <RippleButton
                        onClick={handleInviteStaff}
                        disabled={invitingStaff}
                        className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50 whitespace-nowrap"
                      >
                        {invitingStaff ? 'Sending…' : 'Invite'}
                      </RippleButton>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-white/50">
                      <input type="checkbox" checked={staffFinancials} onChange={(e) => setStaffFinancials(e.target.checked)} className="accent-[#12A5A9]" />
                      Can view financials (rent totals, payment amounts)
                    </label>
                    {staffInviteMsg && <p className="text-white/50 text-xs mt-2">{staffInviteMsg}</p>}
                  </Collapsible>
                )}
              </>
            )}

            {activeTab === 'activity' && (
              <div className="space-y-2">
                {auditLog.length === 0 ? (
                  <p className="text-white/40 text-sm">No activity yet.</p>
                ) : (
                  auditLog.map((entry) => (
                    <div key={entry.id} className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-xs text-white/50">
                      <span className="text-white/80">{entry.actorName}</span> {ACTION_LABELS[entry.action] || entry.action} for{' '}
                      <span className="text-white/80">{entry.ownerName}</span>
                      {entry.amount !== null && <span className="text-white/60"> · ${entry.amount.toFixed(2)}</span>}
                      <span className="text-white/30"> · {new Date(entry.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {feePaymentModal && (
        <StripePaymentModal
          clientSecret={feePaymentModal.clientSecret}
          amount={feePaymentModal.amount}
          title="Management fee"
          connectedAccountId={feePaymentModal.connectedAccountId}
          onClose={() => setFeePaymentModal(null)}
          onSuccess={async () => {
            setFeePaymentModal(null)
            await fetch(`/api/pm/clients/${feePaymentModal.portfolioId}/fee/confirm`, { method: 'POST' }).catch(() => {})
            await loadAll()
          }}
        />
      )}
      {summaryEditor && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSummaryEditor(null)}>
          <div
            className="bg-[#0F1A2E] border border-white/10 w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="text-white font-semibold text-lg">Monthly summary for {summaryEditor.ownerName}</h2>
              <button onClick={() => setSummaryEditor(null)} className="text-white/40 hover:text-white text-xl leading-none" aria-label="Close">×</button>
            </div>
            <p className="text-white/50 text-xs mb-4">
              This is exactly what {summaryEditor.ownerName} receives on the 1st. The figures come straight from real payments, so they&apos;re never edited by you or the AI. Only your note is yours to write.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <label htmlFor="summary-note" className="text-white/80 text-xs font-semibold block mb-1">Your note to {summaryEditor.ownerName}</label>
                  <textarea
                    id="summary-note"
                    value={summaryNote}
                    onChange={(e) => setSummaryNote(e.target.value.slice(0, 1000))}
                    rows={6}
                    placeholder={`e.g. "Unit 2's water heater was replaced this month. Everything else is running smoothly."`}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition resize-none"
                  />
                  <p className="text-white/30 text-[11px] text-right">{summaryNote.length}/1000</p>
                </div>

                <div className="bg-[#12A5A9]/8 border border-[#12A5A9]/25 rounded-xl p-3">
                  <p className="text-white/80 text-xs font-semibold mb-2">✦ Change it with AI</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {['Make it shorter', 'Make it warmer', 'More professional', 'Write a note for this month', 'Translate to Spanish'].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        disabled={summaryBusy !== null}
                        onClick={() => handleSummaryRewrite(chip)}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-[#12A5A9]/40 transition disabled:opacity-40"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      id="summary-instruction"
                      value={summaryInstruction}
                      onChange={(e) => setSummaryInstruction(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSummaryRewrite(summaryInstruction)}
                      placeholder="Or say anything, e.g. mention the roof inspection next week"
                      className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
                    />
                    <RippleButton
                      onClick={() => handleSummaryRewrite(summaryInstruction)}
                      disabled={summaryBusy !== null || !summaryInstruction.trim()}
                      className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-40 whitespace-nowrap"
                    >
                      {summaryBusy === 'rewrite' ? 'Writing…' : 'Rewrite'}
                    </RippleButton>
                  </div>
                </div>

                {summaryMsg && (
                  <p className={`text-xs ${summaryMsg.tone === 'ok' ? 'text-[#12A5A9]' : 'text-red-400'}`}>{summaryMsg.text}</p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <RippleButton
                    onClick={handleSummarySave}
                    disabled={summaryBusy !== null || summaryNote === savedSummaryNote}
                    className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-40"
                  >
                    {summaryBusy === 'save' ? 'Saving…' : summaryNote === savedSummaryNote ? 'Saved' : 'Save note'}
                  </RippleButton>
                  <button
                    type="button"
                    onClick={handleSummaryTest}
                    disabled={summaryBusy !== null}
                    className="text-white/70 hover:text-white text-sm font-semibold px-3 py-2 rounded-xl bg-white/5 border border-white/10 disabled:opacity-40"
                  >
                    {summaryBusy === 'test' ? 'Sending…' : 'Email me a test'}
                  </button>
                </div>
              </div>

              <div>
                <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wide mb-1.5">Live preview</p>
                {summaryBusy === 'loading' && !summaryHtml ? (
                  <div className="h-[420px] rounded-xl bg-white/5 animate-pulse" />
                ) : (
                  <iframe
                    title="Monthly summary preview"
                    srcDoc={summaryHtml}
                    sandbox=""
                    className="w-full h-[420px] rounded-xl border border-white/10 bg-white"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Same tabs every other landlord-section page has — this page had
          none at all, leaving a PM's main dashboard with no way to reach
          Properties/Jobs/Calendar except in-page links. The Home tab's
          /landlord target is safe here: that page now bounces an accepted
          PM member straight back to /landlord/pm. */}
      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
