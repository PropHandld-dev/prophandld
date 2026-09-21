'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'

const TIER_PRICES: Record<string, number> = { tier_20: 20, tier_50: 50, tier_80: 80 }

export default function AdminOverviewPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<{
    userCounts: Record<string, number>
    tierCounts: Record<string, number>
    mrr: number
    rentThisMonth: number
    jobPaymentsAllTime: number
    openDisputes: number
  } | null>(null)

  useEffect(() => {
    const load = async () => {
      const [
        usersRes,
        { data: subs, error: subsError },
        { data: rentPayments, error: rentError },
        { data: paidBids, error: bidsError },
        { data: disputes, error: disputesError },
      ] = await Promise.all([
        fetch('/api/admin/users').then((r) => r.json()).catch(() => ({ users: [] })),
        supabase.from('landlord_subscriptions').select('tier'),
        supabase.from('rent_payments').select('actual_amount, month'),
        supabase.from('bids').select('amount, proposed_amount').eq('payment_status', 'paid'),
        supabase.from('disputes').select('id').eq('status', 'open'),
      ])

      // These queries failing shouldn't crash the page, but they also
      // shouldn't silently render as "0 of everything" with no clue why —
      // log each one so a real permissions/grant issue is diagnosable
      // instead of just looking like an empty platform.
      if (subsError) console.error('Admin overview: could not load landlord_subscriptions', subsError)
      if (rentError) console.error('Admin overview: could not load rent_payments', rentError)
      if (bidsError) console.error('Admin overview: could not load bids', bidsError)
      if (disputesError) console.error('Admin overview: could not load disputes', disputesError)

      const userCounts: Record<string, number> = {}
      ;(usersRes.users || []).forEach((u: any) => {
        if (!u.role) return
        userCounts[u.role] = (userCounts[u.role] || 0) + 1
      })

      const tierCounts: Record<string, number> = {}
      ;(subs || []).forEach((s) => { tierCounts[s.tier] = (tierCounts[s.tier] || 0) + 1 })

      const mrr = Object.entries(tierCounts).reduce((sum, [tier, count]) => sum + (TIER_PRICES[tier] || 0) * count, 0)

      const currentMonth = new Date().toISOString().slice(0, 7)
      const rentThisMonth = (rentPayments || [])
        .filter((p) => p.month?.startsWith(currentMonth))
        .reduce((sum, p) => sum + Number(p.actual_amount || 0), 0)

      const jobPaymentsAllTime = (paidBids || []).reduce((sum, b) => sum + Number(b.amount ?? 0), 0)

      setStats({ userCounts, tierCounts, mrr, rentThisMonth, jobPaymentsAllTime, openDisputes: disputes?.length || 0 })
      setLoading(false)
    }
    load()
  }, [])

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-8">Overview</h1>

      {loading || !stats ? (
        <div className="text-white/50 text-sm">Loading...</div>
      ) : (
        <>
          <ScrollReveal className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            <StatCard label="Landlords" value={stats.userCounts.landlord || 0} />
            <StatCard label="Renters" value={stats.userCounts.renter || 0} />
            <StatCard label="Contractors" value={stats.userCounts.contractor || 0} />
            <StatCard label="Est. MRR" value={`$${stats.mrr.toLocaleString()}`} />
            <StatCard label="Rent this month" value={`$${stats.rentThisMonth.toLocaleString()}`} />
            <StatCard label="Open disputes" value={stats.openDisputes} tone={stats.openDisputes > 0 ? 'yellow' : undefined} />
          </ScrollReveal>

          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
            <h2 className="text-white font-semibold mb-4">Landlord subscription tiers</h2>
            <div className="space-y-2">
              {[['free', 'Free'], ['tier_20', '$20/mo'], ['tier_50', '$50/mo'], ['tier_80', '$80/mo']].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">{label}</span>
                  <span className="text-white text-sm font-medium">{stats.tierCounts[key] || 0}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>

          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6">
            <h2 className="text-white font-semibold mb-2">Job payments processed</h2>
            <p className="text-white text-2xl font-bold">${stats.jobPaymentsAllTime.toLocaleString()}</p>
            <p className="text-white/50 text-xs mt-1">All-time total paid to contractors through Prophandld</p>
          </ScrollReveal>
        </>
      )}
    </AdminLayout>
  )
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: 'yellow' }) {
  return (
    <div className="bg-white/3 border border-white/8 rounded-xl p-4 text-center">
      <div className={`text-xl font-bold ${tone === 'yellow' ? 'text-yellow-400' : 'text-white'}`}>{value}</div>
      <div className="text-white/60 text-xs mt-0.5">{label}</div>
    </div>
  )
}
