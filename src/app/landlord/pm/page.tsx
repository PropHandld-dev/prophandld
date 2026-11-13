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
  monthlySummaryEnabled: boolean
  ownerReadOnly: boolean
  status: 'pending' | 'accepted'
  requestedBy: 'pm' | 'owner'
  propertyCount?: number
  unitCount?: number
  openJobCount?: number
  rentCollectedThisMonth?: number | null
}
type Staff = {
  id: string
  userId: string | null
  name: string
  memberRole: 'admin' | 'staff'
  canViewFinancials: boolean
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
  ownerReadOnly: boolean
}

const ACTION_LABELS: Record<string, string> = {
  job_payment_started: 'approved a job payment',
  job_payment_blocked_needs_owner_signoff: 'tried to approve a payment over threshold',
  job_bulk_approved: 'approved completed work',
}

type PendingJob = { id: string; category: string; createdAt: string; ownerUserId: string; ownerName: string; address: string }
type MonthBucket = { key: string; label: string; rent: number }

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

// Reuses the simple CSS-bar pattern from /admin/transactions -- height as
// a percentage of the widest month, no charting library needed.
function RentTrendChart({ months }: { months: MonthBucket[] }) {
  const max = Math.max(1, ...months.map((m) => m.rent))
  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6">
      <p className="text-white/50 text-xs font-semibold mb-4">Rent collected, last 6 months</p>
      <div className="flex items-end gap-2 h-28">
        {months.map((m) => (
          <div key={m.key} className="flex-1 flex flex-col items-center min-w-0 h-full">
            <p className="text-white/60 text-[10px] h-4 tabular-nums truncate max-w-full">{m.rent > 0 ? `$${m.rent.toFixed(0)}` : ''}</p>
            <div className="flex-1 w-full flex items-end min-h-0">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-[#0A7B7E] to-[#12A5A9]"
                style={{ height: `${Math.max((m.rent / max) * 100, m.rent > 0 ? 4 : 0)}%` }}
              />
            </div>
            <p className="text-white/30 text-[10px] mt-1.5">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
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

export default function PmDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [pendingStaffInvite, setPendingStaffInvite] = useState<{ id: string; orgName: string } | null>(null)
  const [incomingInvites, setIncomingInvites] = useState<IncomingInvite[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [months, setMonths] = useState<MonthBucket[]>([])
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
  // Same Stripe Connect account a landlord already sets up on Profile to
  // receive rent -- management fees land in that same account, so an
  // admin who hasn't done that yet needs to know before trying to bill
  // anyone, not find out only when a client's payment fails.
  const [payoutStatus, setPayoutStatus] = useState<'not_started' | 'onboarding' | 'active' | null>(null)

  const [profileSlug, setProfileSlug] = useState<string | null>(null)
  const [openToClients, setOpenToClients] = useState(false)
  const [pitch, setPitch] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileCopied, setProfileCopied] = useState(false)

  const [orgName, setOrgName] = useState('')
  const [creating, setCreating] = useState(false)

  const [clientEmail, setClientEmail] = useState('')
  const [invitingClient, setInvitingClient] = useState(false)
  const [clientInviteMsg, setClientInviteMsg] = useState<string | null>(null)

  const [myStatus, setMyStatus] = useState<{
    propertyCount: number
    unitCount: number
    openJobCount: number
    entries: { id: string; action: string; amount: number | null; createdAt: string; actorName: string }[]
  } | null>(null)

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
  }, [loadAll])

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
          data.error === 'no_account_found'
            ? 'No Prophandld landlord account found with that email.'
            : data.error === 'already_invited_or_managed'
              ? 'That landlord is already invited or managed by a PM.'
              : data.error || 'Could not send that invite.'
        )
      } else {
        setClientInviteMsg('Invite sent.')
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

  const handleAcceptInvite = async (id: string) => {
    await fetch('/api/pm/clients/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolioId: id }),
    })
    await loadAll()
  }

  const handleDeclineInvite = async (id: string) => {
    await fetch(`/api/pm/clients/${id}`, { method: 'DELETE' })
    await loadAll()
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

  const handleThresholdChange = async (portfolioId: string, value: number) => {
    setClients((prev) => prev.map((c) => (c.id === portfolioId ? { ...c, approvalThreshold: value } : c)))
    await fetch(`/api/pm/clients/${portfolioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalThreshold: value }),
    })
  }

  const handleFeeChange = async (portfolioId: string, amount: number | null, frequency: 'one_time' | 'monthly') => {
    setClients((prev) => prev.map((c) => (c.id === portfolioId ? { ...c, managementFee: amount, managementFeeFrequency: amount === null ? null : frequency } : c)))
    await fetch(`/api/pm/clients/${portfolioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managementFee: amount, managementFeeFrequency: frequency }),
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
                    They'll be able to post and approve maintenance jobs on your behalf, up to ${inv.approvalThreshold.toFixed(0)} per job. You stay the owner, and can remove them at any time.
                  </p>
                  <div className="flex gap-3">
                    <RippleButton
                      onClick={() => handleAcceptInvite(inv.id)}
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
            <div className="flex items-center gap-3">
              <ShieldIcon className="w-5 h-5 text-[#12A5A9] shrink-0" />
              <p className="text-white/70 text-sm">
                Managed by <span className="text-white font-semibold">{acceptedIncoming[0].orgName}</span>. Approval threshold ${acceptedIncoming[0].approvalThreshold.toFixed(0)} per job.
                {acceptedIncoming[0].ownerReadOnly && ' They handle job approvals and payments for you.'}
              </p>
            </div>
            {acceptedIncoming[0].managementFee !== null && (
              <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-white/8">
                <p className="text-white/60 text-sm">
                  Management fee: <span className="text-white font-semibold">${acceptedIncoming[0].managementFee!.toFixed(2)}</span>
                  {acceptedIncoming[0].managementFeeFrequency === 'monthly' ? '/month' : ' (one time)'}
                </p>
                <RippleButton
                  onClick={() => handlePayFee(acceptedIncoming[0].id)}
                  disabled={payingFee}
                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-xl disabled:opacity-50 whitespace-nowrap"
                >
                  {payingFee ? 'Starting…' : 'Pay now'}
                </RippleButton>
              </div>
            )}
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
                {myStatus.entries.map((entry) => (
                  <div key={entry.id} className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-xs text-white/50">
                    <span className="text-white/80">{entry.actorName}</span> {ACTION_LABELS[entry.action] || entry.action}
                    {entry.amount !== null && <span className="text-white/60"> · ${entry.amount.toFixed(2)}</span>}
                    <span className="text-white/30"> · {new Date(entry.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
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
                  <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
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
                    {openToClients && profileSlug && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/property-managers/${profileSlug}`} className="text-[#12A5A9] text-xs font-semibold hover:underline" target="_blank">
                          View your profile →
                        </Link>
                        <button onClick={handleCopyProfileLink} className="text-white/50 hover:text-white text-xs font-semibold">
                          {profileCopied ? 'Copied!' : 'Copy share link'}
                        </button>
                      </div>
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
                              <div className="grid grid-cols-3 gap-2 mb-3">
                                <StatTile icon={BuildingIcon} label="Properties" value={c.propertyCount ?? 0} />
                                <StatTile icon={WrenchIcon} label="Open jobs" value={c.openJobCount ?? 0} />
                                {membership.canViewFinancials ? (
                                  <StatTile icon={DollarSignIcon} label="Rent this month" value={`$${(c.rentCollectedThisMonth || 0).toFixed(0)}`} />
                                ) : (
                                  <StatTile icon={BuildingIcon} label="Units" value={c.unitCount ?? 0} />
                                )}
                              </div>
                              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                                {membership.memberRole === 'admin' ? (
                                  <label className="flex items-center gap-2 text-xs text-white/50">
                                    Approval threshold: $
                                    <input
                                      type="number"
                                      defaultValue={c.approvalThreshold}
                                      onBlur={(e) => handleThresholdChange(c.id, Number(e.target.value) || 0)}
                                      className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs"
                                    />
                                  </label>
                                ) : (
                                  <span className="text-xs text-white/40">Approval threshold: ${c.approvalThreshold.toFixed(0)}</span>
                                )}
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
                                <label className="flex items-center gap-2 text-xs text-white/50">
                                  Management fee: $
                                  <input
                                    type="number"
                                    defaultValue={c.managementFee ?? ''}
                                    placeholder="none"
                                    onBlur={(e) => {
                                      const v = e.target.value.trim()
                                      handleFeeChange(c.id, v === '' ? null : Number(v) || 0, c.managementFeeFrequency || 'monthly')
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
                                  <span className="text-white/30">Billed to {c.ownerName}, paid to you directly.</span>
                                </label>
                              )}
                              {membership.memberRole === 'admin' && (
                                <label className="flex items-center gap-2 text-xs text-white/50 mt-2">
                                  <input
                                    type="checkbox"
                                    checked={c.monthlySummaryEnabled}
                                    onChange={(e) => handleToggleMonthlySummary(c.id, e.target.checked)}
                                    className="accent-[#12A5A9]"
                                  />
                                  Email {c.ownerName} a monthly summary (rent collected, maintenance paid)
                                </label>
                              )}
                              {membership.memberRole === 'admin' && (
                                <label className="flex items-center gap-2 text-xs text-white/50 mt-2">
                                  <input
                                    type="checkbox"
                                    checked={c.ownerReadOnly}
                                    onChange={(e) => handleToggleReadOnly(c.id, e.target.checked)}
                                    className="accent-[#12A5A9]"
                                  />
                                  {c.ownerName} is read-only (you handle job approvals and payments)
                                </label>
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
                  {staff.map((s) => (
                    <div key={s.id} className="bg-white/3 border border-white/8 rounded-xl p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2.5">
                        <p className="text-white text-sm font-medium truncate">{s.name}</p>
                        <span className="text-white/40 text-xs capitalize">{s.memberRole}</span>
                        {s.status === 'pending' && <StatusPill status="pending" />}
                      </div>
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
                        </div>
                      )}
                    </div>
                  ))}
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
    </div>
  )
}
