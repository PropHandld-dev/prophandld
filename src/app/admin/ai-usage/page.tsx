'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'

type UserRow = { userId: string; name: string; email: string; cost: number; calls: number; tokens: number }
type FeatureRow = { feature: string; cost: number; calls: number }

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

export default function AdminAiUsagePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalCost, setTotalCost] = useState(0)
  const [totalCalls, setTotalCalls] = useState(0)
  const [last30DaysCost, setLast30DaysCost] = useState(0)
  const [byUser, setByUser] = useState<UserRow[]>([])
  const [byFeature, setByFeature] = useState<FeatureRow[]>([])

  useEffect(() => {
    fetch('/api/admin/ai-usage')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setTotalCost(data.totalCost || 0)
          setTotalCalls(data.totalCalls || 0)
          setLast30DaysCost(data.last30DaysCost || 0)
          setByUser(data.byUser || [])
          setByFeature(data.byFeature || [])
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Could not load AI usage.')
        setLoading(false)
      })
  }, [])

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-2">AI usage & cost</h1>
      <p className="text-white/50 text-sm mb-8 max-w-2xl">
        Real cost from every AI call in the app, not the worst-case estimates in the proposal. The totals here also feed the live &quot;Claude (Anthropic)&quot; line on the{' '}
        <Link href="/admin/costs" className="text-[#12A5A9] hover:underline">Costs</Link> page.
      </p>

      {loading ? (
        <div className="text-white/50 text-sm">Loading...</div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
      ) : (
        <>
          <ScrollReveal className="grid grid-cols-3 gap-4 mb-8">
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
