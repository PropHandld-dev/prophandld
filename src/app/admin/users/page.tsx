'use client'

import { useEffect, useMemo, useState } from 'react'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import type { LandlordTier } from '@/lib/pricingTiers'

type Role = 'landlord' | 'renter' | 'contractor'

type TrialInfo = {
  trialStartedAt: string | null
  trialOverrideDays: number | null
  freeForever: boolean
}

type AiAssistInfo = TrialInfo & { status: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' }

type AdminUser = {
  id: string
  email: string
  full_name: string | null
  role: Role | null
  created_at: string
  last_sign_in_at: string | null
  termsAcceptedAt: string | null
  termsVersion: string | null
  // landlord
  tier?: LandlordTier
  propertyCount?: number
  mrr?: number
  trial?: TrialInfo
  aiAssist?: AiAssistInfo
  // renter
  hasActiveTenancy?: boolean
  rentAmount?: number | null
  unitLabel?: string | null
  propertyAddress?: string | null
  landlordName?: string | null
  // contractor
  verificationStatus?: 'pending' | 'verified' | 'rejected' | 'unlicensed' | 'none'
  serviceCategories?: string[]
  serviceZip?: string | null
}

const TABS: { role: Role; label: string }[] = [
  { role: 'landlord', label: 'Landlords' },
  { role: 'renter', label: 'Renters' },
  { role: 'contractor', label: 'Contractors' },
]

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never signed in'
  const then = new Date(iso).getTime()
  const diffMs = Date.now() - then
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

function isStale(iso: string | null, days: number): boolean {
  if (!iso) return true
  return Date.now() - new Date(iso).getTime() > days * 86400000
}

const VERIFICATION_STYLES: Record<string, string> = {
  verified: 'bg-[#12A5A9]/15 text-[#12A5A9]',
  pending: 'bg-yellow-500/15 text-yellow-400',
  rejected: 'bg-red-500/15 text-red-400',
  unlicensed: 'bg-white/8 text-white/50',
  none: 'bg-white/8 text-white/40',
}

const VERIFICATION_LABELS: Record<string, string> = {
  verified: 'Verified',
  pending: 'Pending review',
  rejected: 'Rejected',
  unlicensed: 'Self-declared, unlicensed',
  none: 'No submission yet',
}

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Role>('landlord')
  const [search, setSearch] = useState('')

  // Prefilled by AdminSearch's header search box (?role=&q=), so clicking
  // a result lands directly on that person instead of an empty filter —
  // read directly from window.location rather than useSearchParams so
  // this page doesn't need a Suspense boundary just for this.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const role = params.get('role')
    const q = params.get('q')
    if (role === 'landlord' || role === 'renter' || role === 'contractor') setTab(role)
    if (q) setSearch(q)
    if (role || q) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const load = async () => {
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    if (!res.ok) {
      console.error('Error loading users:', data)
      setError(data.error || 'Could not load users.')
      setLoading(false)
      return
    }
    setUsers(data.users || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const byRole = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matches = (u: AdminUser) =>
      !q || u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    return {
      landlord: users.filter((u) => u.role === 'landlord' && matches(u)),
      renter: users.filter((u) => u.role === 'renter' && matches(u)),
      contractor: users.filter((u) => u.role === 'contractor' && matches(u)),
    }
  }, [users, search])

  const rows = byRole[tab].slice().sort((a, b) => {
    // Most recently active first — this page is meant to be glanced at
    // daily, so whoever's actually using the app right now should float
    // to the top instead of the list just being sorted by signup date.
    const aTime = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0
    const bTime = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0
    return bTime - aTime
  })

  const counts = { landlord: byRole.landlord.length, renter: byRole.renter.length, contractor: byRole.contractor.length }

  return (
    <AdminLayout>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-white/40 text-sm mt-1">{users.length} total across all roles</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6 border-b border-white/8">
        {TABS.map((t) => (
          <button
            key={t.role}
            onClick={() => setTab(t.role)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition ${
              tab === t.role
                ? 'text-white border-b-2 border-[#12A5A9] -mb-px'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {t.label} <span className="tabular-nums">({counts[t.role]})</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${TABS.find((t) => t.role === tab)?.label.toLowerCase()}...`}
          className="flex-1 min-w-[220px] bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
        />
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-white/50 text-sm">Loading...</div>
      ) : (
        <>
          <TabSummary tab={tab} rows={rows} />

          {rows.length === 0 ? (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center text-white/50 text-sm">
              No {TABS.find((t) => t.role === tab)?.label.toLowerCase()} match.
            </div>
          ) : (
            <ScrollReveal className="space-y-2.5">
              {rows.map((u) => (
                <UserRow key={u.id} user={u} onReload={load} />
              ))}
            </ScrollReveal>
          )}
        </>
      )}
    </AdminLayout>
  )
}

function TabSummary({ tab, rows }: { tab: Role; rows: AdminUser[] }) {
  if (tab === 'landlord') {
    const totalMrr = rows.reduce((sum, u) => sum + (u.mrr || 0), 0)
    const paying = rows.filter((u) => (u.mrr || 0) > 0).length
    const activeLast30 = rows.filter((u) => !isStale(u.last_sign_in_at, 30)).length
    return (
      <div className="grid grid-cols-3 gap-4 mb-6">
        <MiniStat label="Paying" value={paying} />
        <MiniStat label="Combined MRR" value={`$${totalMrr.toLocaleString()}`} />
        <MiniStat label="Active in last 30d" value={activeLast30} />
      </div>
    )
  }
  if (tab === 'renter') {
    const withTenancy = rows.filter((u) => u.hasActiveTenancy).length
    const activeLast30 = rows.filter((u) => !isStale(u.last_sign_in_at, 30)).length
    return (
      <div className="grid grid-cols-3 gap-4 mb-6">
        <MiniStat label="With an active lease" value={withTenancy} />
        <MiniStat label="No active lease" value={rows.length - withTenancy} tone={rows.length - withTenancy > 0 ? 'yellow' : undefined} />
        <MiniStat label="Active in last 30d" value={activeLast30} />
      </div>
    )
  }
  const verified = rows.filter((u) => u.verificationStatus === 'verified').length
  const pending = rows.filter((u) => u.verificationStatus === 'pending').length
  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      <MiniStat label="Verified" value={verified} />
      <MiniStat label="Pending review" value={pending} tone={pending > 0 ? 'yellow' : undefined} />
      <MiniStat label="Total" value={rows.length} />
    </div>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone?: 'yellow' }) {
  return (
    <div className="bg-white/3 border border-white/8 rounded-xl p-4">
      <div className={`text-xl font-bold tabular-nums ${tone === 'yellow' ? 'text-yellow-400' : 'text-white'}`}>{value}</div>
      <div className="text-white/50 text-xs mt-0.5">{label}</div>
    </div>
  )
}

function UserRow({ user, onReload }: { user: AdminUser; onReload: () => void }) {
  const stale = isStale(user.last_sign_in_at, 30)
  const [trialPanelOpen, setTrialPanelOpen] = useState(false)
  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl px-5 py-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white text-sm font-semibold truncate">{user.full_name || 'Unnamed'}</p>
            {user.role === 'contractor' && (
              <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${VERIFICATION_STYLES[user.verificationStatus || 'none']}`}>
                {VERIFICATION_LABELS[user.verificationStatus || 'none']}
              </span>
            )}
            {user.role === 'renter' && user.hasActiveTenancy === false && (
              <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0 bg-yellow-500/15 text-yellow-400">
                No active lease
              </span>
            )}
            {user.role === 'landlord' && (user.trial?.freeForever || user.aiAssist?.freeForever) && (
              <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0 bg-[#0A7B7E]/20 text-[#12A5A9]">
                Admin grant active
              </span>
            )}
          </div>
          <p className="text-white/50 text-xs truncate mt-0.5">{user.email}</p>

          {user.role === 'landlord' && (
            <p className="text-white/40 text-xs mt-1.5">
              <span className="capitalize text-white/60">{user.tier}</span> tier · {user.propertyCount} propert{user.propertyCount === 1 ? 'y' : 'ies'}
              {(user.mrr || 0) > 0 && <> · <span className="text-[#12A5A9] font-medium">${(user.mrr || 0).toLocaleString()}/mo</span></>}
            </p>
          )}
          {user.role === 'renter' && (
            <p className="text-white/40 text-xs mt-1.5">
              {user.propertyAddress
                ? <>{user.propertyAddress}{user.unitLabel ? ` · Unit ${user.unitLabel}` : ''}{user.landlordName ? ` · Landlord: ${user.landlordName}` : ''}</>
                : 'Not linked to a unit yet'}
            </p>
          )}
          {user.role === 'contractor' && (
            <p className="text-white/40 text-xs mt-1.5">
              {(user.serviceCategories || []).length > 0
                ? user.serviceCategories!.join(', ')
                : 'No service categories set'}
              {user.serviceZip ? ` · near ${user.serviceZip}` : ''}
            </p>
          )}

          {user.role === 'landlord' && (
            <button
              onClick={() => setTrialPanelOpen((v) => !v)}
              className="mt-2 text-[11px] font-semibold text-[#12A5A9] hover:text-white transition"
            >
              {trialPanelOpen ? 'Hide trial & AI Assist' : 'Trial & AI Assist'}
            </button>
          )}
        </div>

        <div className="text-right shrink-0">
          <p className={`text-xs tabular-nums ${stale ? 'text-white/30' : 'text-white/60'}`}>{relativeTime(user.last_sign_in_at)}</p>
          <p className="text-white/25 text-[11px] mt-0.5">Joined {new Date(user.created_at).toLocaleDateString()}</p>
          {user.termsAcceptedAt ? (
            <p className="text-white/25 text-[11px] mt-0.5" title={new Date(user.termsAcceptedAt).toLocaleString()}>
              Terms v{user.termsVersion || '?'} · {new Date(user.termsAcceptedAt).toLocaleDateString()}
            </p>
          ) : (
            <p className="text-yellow-400/70 text-[11px] mt-0.5">Terms not recorded</p>
          )}
        </div>
      </div>

      {trialPanelOpen && user.role === 'landlord' && (
        <TrialGrantPanel landlordUserId={user.id} trial={user.trial} aiAssist={user.aiAssist} onChanged={onReload} />
      )}
    </div>
  )
}

function trialSummary(info?: TrialInfo): string {
  if (!info) return 'Standard 14-day trial'
  if (info.freeForever) return 'Free forever (admin-granted)'
  if (info.trialOverrideDays) {
    const startedAt = info.trialStartedAt ? new Date(info.trialStartedAt) : null
    const daysLeft = startedAt
      ? Math.max(0, Math.ceil((info.trialOverrideDays * 86400000 - (Date.now() - startedAt.getTime())) / 86400000))
      : info.trialOverrideDays
    return `${info.trialOverrideDays}-day trial (admin-granted), ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
  }
  return 'Standard 14-day trial'
}

function aiAssistSummary(info?: AiAssistInfo): string {
  if (!info || info.status === 'none') return 'Not started'
  if (info.freeForever) return 'Free forever (admin-granted)'
  if (info.status === 'canceled') return 'Canceled'
  if (info.status === 'past_due') return 'Payment issue'
  if (info.status === 'active') return 'Active (paying)'
  // trialing
  return trialSummary(info).replace('Standard 14-day trial', 'Standard 14-day trial (AI Assist)')
}

function TrialGrantPanel({
  landlordUserId,
  trial,
  aiAssist,
  onChanged,
}: {
  landlordUserId: string
  trial?: TrialInfo
  aiAssist?: AiAssistInfo
  onChanged: () => void
}) {
  const [daysInput, setDaysInput] = useState<Record<'base' | 'ai_assist', string>>({ base: '30', ai_assist: '30' })
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const grant = async (product: 'base' | 'ai_assist', mode: 'days' | 'free' | 'reset') => {
    const key = `${product}:${mode}`
    setWorking(key)
    setError(null)
    try {
      const days = mode === 'days' ? Number(daysInput[product]) : undefined
      if (mode === 'days' && (!days || days < 1)) {
        setError('Enter a valid number of days.')
        setWorking(null)
        return
      }
      const res = await fetch('/api/admin/trial-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landlordUserId, product, mode, days }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not update trial.')
        setWorking(null)
        return
      }
      onChanged()
    } catch {
      setError('Could not update trial.')
    }
    setWorking(null)
  }

  return (
    <div className="mt-4 pt-4 border-t border-white/8 grid sm:grid-cols-2 gap-4">
      {error && (
        <div className="sm:col-span-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-red-400 text-xs">
          {error}
        </div>
      )}

      <div>
        <p className="text-white text-xs font-semibold mb-1">Base plan</p>
        <p className="text-white/40 text-[11px] mb-2.5">{trialSummary(trial)}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="number"
            min={1}
            value={daysInput.base}
            onChange={(e) => setDaysInput((v) => ({ ...v, base: e.target.value }))}
            className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#12A5A9]"
          />
          <RippleButton
            onClick={() => grant('base', 'days')}
            disabled={working === 'base:days'}
            className="bg-white/8 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg hover:bg-white/12 transition disabled:opacity-50"
          >
            days
          </RippleButton>
          <RippleButton
            onClick={() => grant('base', 'free')}
            disabled={working === 'base:free'}
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            Make free forever
          </RippleButton>
          {(trial?.trialOverrideDays || trial?.freeForever) && (
            <RippleButton
              onClick={() => grant('base', 'reset')}
              disabled={working === 'base:reset'}
              className="text-white/50 text-[11px] font-semibold px-3 py-1.5 rounded-lg hover:text-white transition disabled:opacity-50"
            >
              Reset
            </RippleButton>
          )}
        </div>
      </div>

      <div>
        <p className="text-white text-xs font-semibold mb-1">AI Assist</p>
        <p className="text-white/40 text-[11px] mb-2.5">{aiAssistSummary(aiAssist)}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="number"
            min={1}
            value={daysInput.ai_assist}
            onChange={(e) => setDaysInput((v) => ({ ...v, ai_assist: e.target.value }))}
            className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#12A5A9]"
          />
          <RippleButton
            onClick={() => grant('ai_assist', 'days')}
            disabled={working === 'ai_assist:days'}
            className="bg-white/8 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg hover:bg-white/12 transition disabled:opacity-50"
          >
            days
          </RippleButton>
          <RippleButton
            onClick={() => grant('ai_assist', 'free')}
            disabled={working === 'ai_assist:free'}
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            Make free forever
          </RippleButton>
          {aiAssist && aiAssist.status !== 'none' && (
            <RippleButton
              onClick={() => grant('ai_assist', 'reset')}
              disabled={working === 'ai_assist:reset'}
              className="text-white/50 text-[11px] font-semibold px-3 py-1.5 rounded-lg hover:text-white transition disabled:opacity-50"
            >
              Reset
            </RippleButton>
          )}
        </div>
      </div>
    </div>
  )
}
