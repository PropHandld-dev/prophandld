'use client'

import { useEffect, useMemo, useState } from 'react'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'

type Flag = { label: string; severity: 'red' | 'yellow' | 'info' }
type Tx = {
  id: string
  kind: 'rent' | 'job' | 'subscription'
  date: string
  amount: number
  status: 'succeeded' | 'processing' | 'pending' | 'refunded' | 'failed' | 'manual'
  method: string | null
  from: string
  to: string
  description: string
  place: string
  stripeUrl: string | null
  flags: Flag[]
}
type Data = {
  testMode: boolean
  transactions: Tx[]
  summary: {
    rentThisMonth: number
    rentAllTime: number
    jobsThisMonth: number
    jobsAllTime: number
    mrr: number
    paidSubscribers: number
    inFlight: number
    inFlightCount: number
    needsAttention: number
    manualRent: number
    payoutsReady: number
    payoutsNotReady: number
  }
  months: { key: string; label: string; rent: number; jobs: number }[]
}

const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 === 0 ? 0 : 2 })

const KIND_LABEL: Record<Tx['kind'], string> = { rent: 'Rent', job: 'Job payment', subscription: 'Subscription' }
const KIND_STYLE: Record<Tx['kind'], string> = {
  rent: 'bg-[#12A5A9]/15 text-[#12A5A9]',
  job: 'bg-blue-400/15 text-blue-300',
  subscription: 'bg-purple-400/15 text-purple-300',
}
const STATUS_STYLE: Record<Tx['status'], string> = {
  succeeded: 'bg-[#0A7B7E]/20 text-[#12A5A9]',
  processing: 'bg-yellow-500/15 text-yellow-400',
  pending: 'bg-white/8 text-white/60',
  refunded: 'bg-white/8 text-white/60',
  failed: 'bg-red-500/15 text-red-400',
  manual: 'bg-white/8 text-white/60',
}
const STATUS_LABEL: Record<Tx['status'], string> = {
  succeeded: 'Paid',
  processing: 'Processing',
  pending: 'Not completed',
  refunded: 'Refunded',
  failed: 'Failed',
  manual: 'Recorded manually',
}
const FLAG_STYLE: Record<Flag['severity'], string> = {
  red: 'text-red-400',
  yellow: 'text-yellow-400',
  info: 'text-white/50',
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === 'warn' ? 'bg-yellow-500/8 border-yellow-500/25' : 'bg-white/3 border-white/8'}`}>
      <p className="text-white/50 text-xs">{label}</p>
      <p className="text-white text-2xl font-bold mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-white/50 text-xs mt-1">{sub}</p>}
    </div>
  )
}

export default function AdminTransactionsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<'all' | Tx['kind']>('all')
  const [status, setStatus] = useState<'all' | 'attention' | Tx['status']>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch('/api/admin/transactions')
      .then((r) => r.json())
      .then((json) => (json.error ? setError(json.error) : setData(json)))
      .catch(() => setError('Could not load transactions.'))
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    return data.transactions.filter((t) => {
      if (kind !== 'all' && t.kind !== kind) return false
      if (status === 'attention' && !t.flags.some((f) => f.severity !== 'info')) return false
      if (status !== 'all' && status !== 'attention' && t.status !== status) return false
      if (q && ![t.from, t.to, t.description, t.place].some((s) => s.toLowerCase().includes(q))) return false
      return true
    })
  }, [data, kind, status, query])

  const maxMonth = data ? Math.max(1, ...data.months.map((m) => m.rent + m.jobs)) : 1

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-2">Transactions</h1>
      <p className="text-white/50 text-sm mb-6">Every dollar moving through the platform: rent, job payments and subscriptions.</p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{error}</div>
      )}
      {!data && !error && <div className="text-white/50 text-sm">Loading...</div>}

      {data && (
        <>
          {data.testMode && (
            <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-4 py-3 text-yellow-400/90 text-sm mb-6">
              Stripe is in <span className="font-semibold">test mode</span>. Nothing below is real money, and the Stripe links open your test dashboard.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <Tile label="Rent paid this month" value={money(data.summary.rentThisMonth)} sub={`${money(data.summary.rentAllTime)} all time`} />
            <Tile label="Job payments this month" value={money(data.summary.jobsThisMonth)} sub={`${money(data.summary.jobsAllTime)} all time`} />
            <Tile label="Subscription revenue" value={`${money(data.summary.mrr)}/mo`} sub={`${data.summary.paidSubscribers} paying landlord${data.summary.paidSubscribers === 1 ? '' : 's'}`} />
            <Tile label="In flight" value={money(data.summary.inFlight)} sub={`${data.summary.inFlightCount} payment${data.summary.inFlightCount === 1 ? '' : 's'} still clearing`} />
            <Tile
              label="Needs attention"
              value={String(data.summary.needsAttention)}
              sub={data.summary.needsAttention ? 'Stuck or incomplete payments' : 'Nothing stuck'}
              tone={data.summary.needsAttention ? 'warn' : undefined}
            />
            <Tile
              label="Payout accounts ready"
              value={`${data.summary.payoutsReady} of ${data.summary.payoutsReady + data.summary.payoutsNotReady}`}
              sub={data.summary.payoutsNotReady ? `${data.summary.payoutsNotReady} still setting up` : 'All set up'}
              tone={data.summary.payoutsNotReady ? 'warn' : undefined}
            />
          </div>

          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-sm">Volume, last 6 months</h2>
              <div className="flex items-center gap-4 text-xs text-white/60">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#12A5A9]" /> Rent</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400" /> Job payments</span>
              </div>
            </div>
            <div className="flex gap-3 h-44">
              {data.months.map((m) => {
                const total = m.rent + m.jobs
                return (
                  <div key={m.key} className="flex-1 flex flex-col items-center min-w-0 h-full">
                    <p className="text-white/60 text-[10px] h-4 tabular-nums truncate max-w-full">{total > 0 ? money(total) : ''}</p>
                    <div className="flex-1 w-full flex items-end min-h-0">
                      <div className="w-full flex flex-col justify-end rounded-t-md overflow-hidden" style={{ height: `${(total / maxMonth) * 100}%` }}>
                        <div className="bg-blue-400" style={{ height: total ? `${(m.jobs / total) * 100}%` : 0 }} />
                        <div className="bg-[#12A5A9]" style={{ height: total ? `${(m.rent / total) * 100}%` : 0 }} />
                      </div>
                    </div>
                    <p className="text-white/50 text-xs mt-2">{m.label}</p>
                  </div>
                )
              })}
            </div>
            <p className="text-white/40 text-xs mt-4">
              Prophandld doesn&apos;t take a fee on rent or job payments yet, so platform revenue is subscriptions only.
              {data.summary.manualRent > 0 && ` ${money(data.summary.manualRent)} of rent was recorded by landlords outside Stripe and isn't in the volume above.`}
            </p>
          </ScrollReveal>

          <div className="flex flex-wrap gap-3 mb-4">
            <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition">
              <option value="all" className="bg-[#0C1A2E]">All types</option>
              <option value="rent" className="bg-[#0C1A2E]">Rent</option>
              <option value="job" className="bg-[#0C1A2E]">Job payments</option>
              <option value="subscription" className="bg-[#0C1A2E]">Subscriptions</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition">
              <option value="all" className="bg-[#0C1A2E]">All statuses</option>
              <option value="attention" className="bg-[#0C1A2E]">Needs attention</option>
              {(Object.keys(STATUS_LABEL) as Tx['status'][]).map((s) => (
                <option key={s} value={s} className="bg-[#0C1A2E]">{STATUS_LABEL[s]}</option>
              ))}
            </select>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, address, description"
              className="flex-1 min-w-[12rem] bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            {filtered.length === 0 ? (
              <p className="text-white/50 text-sm p-6">No transactions match.</p>
            ) : (
              filtered.map((t) => (
                <div key={t.id} className="px-5 py-4 border-b border-white/5 last:border-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${KIND_STYLE[t.kind]}`}>{KIND_LABEL[t.kind]}</span>
                        <p className="text-white text-sm font-medium">{t.description}</p>
                      </div>
                      <p className="text-white/60 text-xs mt-1">
                        {t.from} <span className="text-white/30">→</span> {t.to}
                        {t.place ? <span className="text-white/40"> · {t.place}</span> : null}
                      </p>
                      {t.flags.map((f) => (
                        <p key={f.label} className={`text-xs mt-1 ${FLAG_STYLE[f.severity]}`}>{f.label}</p>
                      ))}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-white font-semibold tabular-nums">{money(t.amount)}</p>
                      <span className={`inline-block text-[11px] font-semibold rounded-full px-2 py-0.5 mt-1 ${STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                      <p className="text-white/40 text-[11px] mt-1">
                        {new Date(t.date).toLocaleDateString()}
                        {t.method ? ` · ${t.method === 'bank' ? 'bank' : t.method}` : ''}
                      </p>
                      {t.stripeUrl && (
                        <a href={t.stripeUrl} target="_blank" rel="noopener noreferrer" className="text-[#12A5A9] text-[11px] font-semibold hover:underline">
                          View in Stripe →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </ScrollReveal>
          <p className="text-white/40 text-xs mt-3">Showing {filtered.length} transaction{filtered.length === 1 ? '' : 's'}. Loads up to 500 recent rent and job payments.</p>
        </>
      )}
    </AdminLayout>
  )
}
