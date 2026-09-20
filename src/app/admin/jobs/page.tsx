'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'

type Person = { id: string; name: string | null; email: string | null; phone: string | null }
type Job = {
  id: string
  category: string
  description: string | null
  status: string
  isEmergency: boolean
  createdAt: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  unit: string | null
  schedule: { date: string | null; window: string | null; time: string | null; confirmed: boolean }
  completedAt: string | null
  approvedAt: string | null
  landlord: Person | null
  tenant: Person | null
  contractor: (Person & { badges: string[] }) | null
  bidCount: number
  pendingBids: number
  acceptedAmount: number | null
  paymentStatus: string | null
  hasOpenDispute: boolean
  flags: { key: string; label: string; severity: 'red' | 'yellow' | 'info' }[]
}

const STATUSES = [
  'all', 'pending_approval', 'approved', 'bidding', 'bid_selected', 'scheduled',
  'in_progress', 'pending_review', 'completed', 'archived', 'declined', 'disputed',
]
const CLOSED = ['completed', 'archived', 'declined']

const FLAG_STYLE = {
  red: 'bg-red-500/15 text-red-400',
  yellow: 'bg-yellow-500/15 text-yellow-400',
  info: 'bg-white/8 text-white/60',
}

const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const label = (s: string) => s.replace(/_/g, ' ')

function PersonBlock({ title, person }: { title: string; person: Person | null }) {
  return (
    <div>
      <p className="text-white/50 text-xs mb-1">{title}</p>
      {person ? (
        <>
          <p className="text-white text-sm">{person.name || 'Unnamed'}</p>
          {person.email && <a href={`mailto:${person.email}`} className="text-[#12A5A9] text-xs hover:underline block truncate">{person.email}</a>}
          {person.phone && <a href={`tel:${person.phone}`} className="text-[#12A5A9] text-xs hover:underline block">{person.phone}</a>}
        </>
      ) : (
        <p className="text-white/40 text-sm">None</p>
      )}
    </div>
  )
}

function Tile({ label: text, value, tone }: { label: string; value: number; tone?: 'warn' | 'red' }) {
  const style = tone === 'red' ? 'bg-red-500/8 border-red-500/25' : tone === 'warn' ? 'bg-yellow-500/8 border-yellow-500/25' : 'bg-white/3 border-white/8'
  return (
    <div className={`rounded-2xl border p-4 ${style}`}>
      <p className="text-white/50 text-xs">{text}</p>
      <p className="text-white text-2xl font-bold mt-1 tabular-nums">{value}</p>
    </div>
  )
}

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [emergencyOnly, setEmergencyOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/jobs')
      .then((r) => r.json())
      .then((json) => (json.error ? setError(json.error) : setJobs(json.jobs)))
      .catch(() => setError('Could not load jobs.'))
  }, [])

  const stats = useMemo(() => {
    const list = jobs || []
    return {
      open: list.filter((j) => !CLOSED.includes(j.status)).length,
      attention: list.filter((j) => j.flags.some((f) => f.severity !== 'info')).length,
      emergencies: list.filter((j) => j.isEmergency && !CLOSED.includes(j.status)).length,
      disputes: list.filter((j) => j.hasOpenDispute).length,
    }
  }, [jobs])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (jobs || []).filter((j) => {
      if (statusFilter !== 'all' && j.status !== statusFilter) return false
      if (attentionOnly && !j.flags.some((f) => f.severity !== 'info')) return false
      if (emergencyOnly && !j.isEmergency) return false
      if (q) {
        const hay = [j.category, j.address, j.city, j.landlord?.name, j.tenant?.name, j.contractor?.name, j.description]
        if (!hay.some((s) => s?.toLowerCase().includes(q))) return false
      }
      return true
    })
  }, [jobs, statusFilter, attentionOnly, emergencyOnly, query])

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-6">Jobs{jobs ? ` (${jobs.length})` : ''}</h1>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{error}</div>}
      {!jobs && !error && <div className="text-white/50 text-sm">Loading...</div>}

      {jobs && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Tile label="Open jobs" value={stats.open} />
            <Tile label="Needs attention" value={stats.attention} tone={stats.attention ? 'warn' : undefined} />
            <Tile label="Open emergencies" value={stats.emergencies} tone={stats.emergencies ? 'red' : undefined} />
            <Tile label="Open disputes" value={stats.disputes} tone={stats.disputes ? 'red' : undefined} />
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s} className="bg-[#0C1A2E] capitalize">{s === 'all' ? 'All statuses' : label(s)}</option>
              ))}
            </select>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search address, name, trade"
              className="flex-1 min-w-[12rem] bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
            />
            <button
              onClick={() => setAttentionOnly(!attentionOnly)}
              className={`text-sm rounded-xl px-4 py-2.5 border transition ${attentionOnly ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}
            >
              Needs attention
            </button>
            <button
              onClick={() => setEmergencyOnly(!emergencyOnly)}
              className={`text-sm rounded-xl px-4 py-2.5 border transition ${emergencyOnly ? 'bg-red-500/15 border-red-500/40 text-red-400' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}
            >
              Emergencies
            </button>
          </div>

          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            {filtered.length === 0 ? (
              <p className="text-white/50 text-sm p-6">No jobs match.</p>
            ) : (
              filtered.map((j) => {
                const open = openId === j.id
                const where = [j.address, j.unit ? `Unit ${j.unit}` : null, j.city].filter(Boolean).join(', ')
                const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([j.address, j.city, j.state, j.zip].filter(Boolean).join(', '))}`
                return (
                  <div key={j.id} className="border-b border-white/5 last:border-0">
                    <button onClick={() => setOpenId(open ? null : j.id)} className="w-full text-left px-5 py-4 hover:bg-white/3 transition">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white text-sm font-medium">{j.category}</p>
                            {j.isEmergency && (
                              <span className="text-[10px] bg-red-500/20 text-red-400 rounded-full px-2 py-0.5 font-semibold">Emergency</span>
                            )}
                          </div>
                          <p className="text-white/60 text-xs truncate mt-0.5">{where}</p>
                          {j.flags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {j.flags.map((f) => (
                                <span key={f.key} className={`text-[11px] rounded-full px-2 py-0.5 ${FLAG_STYLE[f.severity]}`}>{f.label}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs bg-white/8 text-white/60 rounded-full px-2.5 py-0.5 capitalize">{label(j.status)}</span>
                          <span className="text-white/50 text-xs hidden sm:inline">{new Date(j.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </button>

                    {open && (
                      <div className="px-5 pb-5 space-y-5">
                        {j.description && <p className="text-white/70 text-sm leading-relaxed">{j.description}</p>}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <PersonBlock title="Landlord" person={j.landlord} />
                          <PersonBlock title="Tenant" person={j.tenant} />
                          <PersonBlock title="Contractor" person={j.contractor} />
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div>
                            <p className="text-white/50 text-xs mb-1">Bids</p>
                            <p className="text-white text-sm">{j.bidCount} total{j.pendingBids ? `, ${j.pendingBids} open` : ''}</p>
                          </div>
                          <div>
                            <p className="text-white/50 text-xs mb-1">Accepted amount</p>
                            <p className="text-white text-sm">{j.acceptedAmount != null ? money(j.acceptedAmount) : '—'}</p>
                          </div>
                          <div>
                            <p className="text-white/50 text-xs mb-1">Payment</p>
                            <p className="text-white text-sm capitalize">{j.paymentStatus ? label(j.paymentStatus) : '—'}</p>
                          </div>
                          <div>
                            <p className="text-white/50 text-xs mb-1">Schedule</p>
                            <p className="text-white text-sm">
                              {j.schedule.date
                                ? `${new Date(j.schedule.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${j.schedule.time ? ` ${j.schedule.time}` : j.schedule.window ? ` (${j.schedule.window})` : ''}${j.schedule.confirmed ? '' : ' · unconfirmed'}`
                                : '—'}
                            </p>
                          </div>
                        </div>

                        {j.contractor && (
                          <div>
                            <p className="text-white/50 text-xs mb-1.5">Contractor&apos;s verified credentials</p>
                            {j.contractor.badges.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {j.contractor.badges.map((b) => (
                                  <span key={b} className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] rounded-full px-2 py-0.5 font-semibold">{b} ✓</span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-yellow-400/80 text-xs">None verified yet.</p>
                            )}
                          </div>
                        )}

                        <div className="text-white/40 text-xs space-y-0.5">
                          <p>Reported {new Date(j.createdAt).toLocaleString()}</p>
                          {j.completedAt && <p>Contractor marked complete {new Date(j.completedAt).toLocaleString()}</p>}
                          {j.approvedAt && <p>Landlord approved {new Date(j.approvedAt).toLocaleString()}</p>}
                        </div>

                        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="text-[#12A5A9] text-xs font-semibold hover:underline">
                            Open in Maps →
                          </a>
                          {j.state && (
                            <Link href={`/admin/contractors?state=${j.state}`} className="text-[#12A5A9] text-xs font-semibold hover:underline">
                              Where to verify a {j.state} contractor →
                            </Link>
                          )}
                          {j.contractor && (
                            <Link href="/admin/contractors" className="text-[#12A5A9] text-xs font-semibold hover:underline">
                              Review contractor credentials →
                            </Link>
                          )}
                          {j.hasOpenDispute && (
                            <Link href="/admin/disputes" className="text-red-400 text-xs font-semibold hover:underline">
                              Open dispute →
                            </Link>
                          )}
                          <Link href="/admin/transactions" className="text-white/60 text-xs hover:text-white hover:underline">
                            Transactions →
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </ScrollReveal>
        </>
      )}
    </AdminLayout>
  )
}
