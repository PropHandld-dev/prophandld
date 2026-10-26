'use client'

import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'

type CostItem = {
  id: string
  label: string
  category: string
  pricing_note: string | null
  billing_url: string | null
  monthly_estimate: number
  billing_frequency: 'monthly' | 'annual' | 'one_time'
  updated_at: string
  live: boolean
}

function monthlyEquivalent(item: CostItem) {
  if (item.billing_frequency === 'annual') return item.monthly_estimate / 12
  if (item.billing_frequency === 'one_time') return 0
  return item.monthly_estimate
}

function frequencyLabel(f: CostItem['billing_frequency']) {
  if (f === 'annual') return 'Annual'
  if (f === 'one_time') return 'One-time'
  return 'Monthly'
}

export default function AdminCostsPage() {
  const [items, setItems] = useState<CostItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Set<string>>(new Set())

  const load = async () => {
    const res = await fetch('/api/admin/cost-items')
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Could not load cost items.')
    } else {
      setItems(data.items || [])
      setDrafts(Object.fromEntries((data.items || []).map((i: CostItem) => [i.id, String(i.monthly_estimate)])))
      setError(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const saveItem = async (id: string) => {
    const raw = drafts[id]
    const value = parseFloat(raw)
    if (Number.isNaN(value) || value < 0) return
    const current = items.find((i) => i.id === id)
    if (current && current.monthly_estimate === value) return
    setSaving((prev) => new Set(prev).add(id))
    const res = await fetch('/api/admin/cost-items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, monthlyEstimate: value }),
    })
    if (res.ok) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, monthly_estimate: value } : i)))
    }
    setSaving((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const monthlyTotal = items.reduce((sum, i) => sum + monthlyEquivalent(i), 0)
  const annualTotal = monthlyTotal * 12

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-2">Costs</h1>
      <p className="text-white/50 text-sm mb-8 max-w-2xl">
        What Prophandld actually pays to run, broken out by vendor. Twilio pulls its real cost live, straight from Twilio&apos;s own usage API; everything else is manually tracked, with a direct link to that platform&apos;s own billing page so the number here is easy to keep honest. Annual and one-time costs show amortized into the monthly total below, since that&apos;s the number that matters for a recurring net-margin conversation.
      </p>

      {loading ? (
        <div className="text-white/50 text-sm">Loading...</div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
      ) : (
        <>
          <ScrollReveal>
            <div className="bg-gradient-to-r from-[#0A7B7E]/15 to-[#12A5A9]/15 border border-[#12A5A9]/25 rounded-2xl p-6 mb-8 flex flex-wrap gap-8">
              <div>
                <p className="text-white/50 text-xs mb-1">Monthly, amortized</p>
                <p className="text-3xl font-bold text-white tabular-nums">${monthlyTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-white/50 text-xs mb-1">Annualized</p>
                <p className="text-3xl font-bold text-white/70 tabular-nums">${annualTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="flex-1 min-w-[160px] flex items-end justify-end">
                <p className="text-white/40 text-xs">Feeds the Infrastructure line on the Overview tab directly, nothing to sync by hand.</p>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((item) => (
              <div key={item.id} className="bg-white/3 border border-white/8 rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-white font-semibold text-sm">{item.label}</h3>
                    <p className="text-white/40 text-xs mt-0.5">{item.category}</p>
                  </div>
                  {item.live ? (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#12A5A9]/15 text-[#12A5A9]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#12A5A9]" /> Live
                    </span>
                  ) : item.billing_frequency !== 'monthly' && (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/8 text-white/50">
                      {frequencyLabel(item.billing_frequency)}
                    </span>
                  )}
                </div>

                {item.pricing_note && <p className="text-white/40 text-xs leading-relaxed">{item.pricing_note}</p>}

                {item.live ? (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-white text-lg font-bold tabular-nums">${item.monthly_estimate.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    <span className="text-white/30 text-xs">this month, pulled directly from Twilio just now</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-white/40 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={drafts[item.id] ?? ''}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      onBlur={() => saveItem(item.id)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-sm font-semibold tabular-nums focus:outline-none focus:border-[#12A5A9] transition"
                    />
                    <span className="text-white/30 text-xs shrink-0">
                      {saving.has(item.id) ? 'saving…' : `/${item.billing_frequency === 'annual' ? 'yr' : item.billing_frequency === 'one_time' ? 'once' : 'mo'}`}
                    </span>
                  </div>
                )}

                {item.billing_url && (
                  <a
                    href={item.billing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#12A5A9] text-xs font-semibold hover:underline mt-auto pt-1"
                  >
                    Open billing dashboard →
                  </a>
                )}
              </div>
            ))}
          </ScrollReveal>
        </>
      )}
    </AdminLayout>
  )
}
