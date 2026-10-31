'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'

type UserRow = { userId: string; name: string; email: string; cost: number; calls: number; tokens: number }
type FeatureRow = { feature: string; cost: number; calls: number }
type DayRow = { date: string; cost: number; calls: number }

const FEATURE_LABELS: Record<string, string> = {
  'lease-extraction': 'Lease document extraction',
  'compliance-extraction': 'Compliance document extraction',
  'appliance-extraction': 'Appliance photo extraction',
  'lease-qa': 'Lease Q&A',
  troubleshoot: 'Troubleshoot-first reporting',
  'bid-polish': 'Bid-polish assistant',
  'draft-message': 'AI-drafted tenant messages',
  'portfolio-digest': 'Portfolio digest + nudges',
  'job-ready-check': 'Ready-to-bid check',
  'smart-replies': 'Smart reply suggestions',
  'help-chat': 'AI help chat',
  'photo-severity': 'Photo severity analysis',
  'before-after-check': 'Before/after photo check',
  'compliance-gap-check': 'Compliance gap suggestions',
}

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

// The underlying query is cheap at real usage (see the route's own
// comment — the table stays small, this is a page-load aggregation, not a
// cached report), so this polls instead of requiring a manual reload. 20s
// rather than something tighter: an admin watching this page is checking
// in on cost, not debugging a single call in real time.
const REFRESH_MS = 20000

export default function AdminAiUsagePage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalCost, setTotalCost] = useState(0)
  const [totalCalls, setTotalCalls] = useState(0)
  const [last30DaysCost, setLast30DaysCost] = useState(0)
  const [aiAssistCost, setAiAssistCost] = useState(0)
  const [payingLandlordCount, setPayingLandlordCount] = useState(0)
  const [trialingLandlordCount, setTrialingLandlordCount] = useState(0)
  const [costPerPayingLandlord, setCostPerPayingLandlord] = useState<number | null>(null)
  const [dailyTrend, setDailyTrend] = useState<DayRow[]>([])
  const [byUser, setByUser] = useState<UserRow[]>([])
  const [byFeature, setByFeature] = useState<FeatureRow[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true)
    fetch('/api/admin/ai-usage')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setError(null)
          setTotalCost(data.totalCost || 0)
          setTotalCalls(data.totalCalls || 0)
          setLast30DaysCost(data.last30DaysCost || 0)
          setAiAssistCost(data.aiAssistCost || 0)
          setPayingLandlordCount(data.payingLandlordCount || 0)
          setTrialingLandlordCount(data.trialingLandlordCount || 0)
          setCostPerPayingLandlord(data.costPerPayingLandlord ?? null)
          setDailyTrend(data.dailyTrend || [])
          setByUser(data.byUser || [])
          setByFeature(data.byFeature || [])
          setLastUpdated(new Date())
        }
        setLoading(false)
        setRefreshing(false)
      })
      .catch(() => {
        setError('Could not load AI usage.')
        setLoading(false)
        setRefreshing(false)
      })
  }

  useEffect(() => {
    load(false)
    const id = setInterval(() => load(true), REFRESH_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') load(true) }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-2xl font-bold text-white">AI usage & cost</h1>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="shrink-0 text-xs font-semibold text-[#12A5A9] hover:underline disabled:opacity-50 flex items-center gap-1.5 mt-1"
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full bg-[#12A5A9] ${refreshing ? 'animate-pulse' : ''}`} />
          {refreshing ? 'Refreshing…' : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Refresh'}
        </button>
      </div>
      <p className="text-white/50 text-sm mb-8 max-w-2xl">
        Real cost from every AI call in the app, not the worst-case estimates in the proposal. Refreshes automatically every 20 seconds. The totals here also feed the live &quot;Claude (Anthropic)&quot; line on the{' '}
        <Link href="/admin/costs" className="text-[#12A5A9] hover:underline">Costs</Link> page.
      </p>

      {loading ? (
        <div className="text-white/50 text-sm">Loading...</div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
      ) : (
        <>
          <ScrollReveal className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <p className="text-white/50 text-xs mb-1">All-time cost</p>
              <p className="text-2xl font-bold text-white tabular-nums">{money(totalCost)}</p>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <p className="text-white/50 text-xs mb-1">Last 30 days</p>
              <p className="text-2xl font-bold text-white tabular-nums">{money(last30DaysCost)}</p>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <p className="text-white/50 text-xs mb-1">Total AI calls</p>
              <p className="text-2xl font-bold text-white tabular-nums">{totalCalls.toLocaleString()}</p>
            </div>
          </ScrollReveal>

          <ScrollReveal className="grid sm:grid-cols-[1fr_auto] gap-4 mb-8">
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <p className="text-white/50 text-xs mb-3">Daily AI Assist cost, last 30 days</p>
              {dailyTrend.length === 0 || dailyTrend.every((d) => d.cost === 0) ? (
                <p className="text-white/30 text-xs py-4">No usage yet in this window.</p>
              ) : (
                <div className="flex items-end gap-[3px] h-16">
                  {dailyTrend.map((d) => {
                    const max = Math.max(...dailyTrend.map((x) => x.cost), 0.0001)
                    const pct = Math.max((d.cost / max) * 100, d.cost > 0 ? 6 : 0)
                    return (
                      <div
                        key={d.date}
                        title={`${d.date}: ${money(d.cost)} · ${d.calls} call${d.calls === 1 ? '' : 's'}`}
                        className={`flex-1 rounded-sm transition-all ${d.cost > 0 ? 'bg-gradient-to-t from-[#0A7B7E] to-[#12A5A9]' : 'bg-white/8'}`}
                        style={{ height: `${pct}%`, minHeight: d.cost > 0 ? '3px' : '2px' }}
                      />
                    )
                  })}
                </div>
              )}
              <div className="flex justify-between text-white/30 text-[10px] mt-2">
                <span>{dailyTrend[0]?.date}</span>
                <span>{dailyTrend[dailyTrend.length - 1]?.date}</span>
              </div>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5 sm:w-56">
              <p className="text-white/50 text-xs mb-1">Cost per paying AI Assist landlord</p>
              {payingLandlordCount === 0 ? (
                <>
                  <p className="text-xl font-bold text-white/40">&mdash;</p>
                  <p className="text-white/40 text-xs mt-1">No active (paying) subscribers yet{trialingLandlordCount > 0 ? ` · ${trialingLandlordCount} trialing` : ''}.</p>
                </>
              ) : (
                <>
                  <p className={`text-2xl font-bold tabular-nums ${costPerPayingLandlord !== null && costPerPayingLandlord < 4.99 ? 'text-[#12A5A9]' : 'text-yellow-400'}`}>
                    {money(costPerPayingLandlord || 0)}
                  </p>
                  <p className="text-white/40 text-xs mt-1">
                    vs $4.99+/mo floor price &middot; {payingLandlordCount} paying{trialingLandlordCount > 0 ? `, ${trialingLandlordCount} trialing` : ''}
                  </p>
                </>
              )}
            </div>
          </ScrollReveal>

          <h2 className="text-white font-semibold mb-3">By feature</h2>
          {byFeature.length === 0 ? (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center text-white/50 text-sm mb-8">No AI calls logged yet.</div>
          ) : (
            <ScrollReveal className="space-y-2 mb-8">
              {byFeature.map((f) => (
                <div key={f.feature} className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <span className="text-white text-sm">{FEATURE_LABELS[f.feature] || f.feature}</span>
                  <span className="text-white/50 text-xs tabular-nums shrink-0">{f.calls} call{f.calls === 1 ? '' : 's'} · {money(f.cost)}</span>
                </div>
              ))}
            </ScrollReveal>
          )}

          <h2 className="text-white font-semibold mb-3">By landlord</h2>
          <p className="text-white/40 text-xs mb-3">Whoever&apos;s AI Assist subscription a call rode on, even when a renter or contractor was the one who actually triggered it.</p>
          {byUser.length === 0 ? (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center text-white/50 text-sm">No billed usage yet.</div>
          ) : (
            <ScrollReveal className="space-y-2">
              {byUser.map((u) => (
                <div key={u.userId} className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white text-sm truncate">{u.name}</p>
                    <p className="text-white/40 text-xs truncate">{u.email}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-white text-sm font-semibold tabular-nums">{money(u.cost)}</p>
                    <p className="text-white/40 text-xs tabular-nums">{u.calls} call{u.calls === 1 ? '' : 's'} · {u.tokens.toLocaleString()} tokens</p>
                  </div>
                </div>
              ))}
            </ScrollReveal>
          )}
        </>
      )}
    </AdminLayout>
  )
}
