'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'
import { MonthlyBarChart, type MonthPoint } from '@/components/admin/MonthlyBarChart'
import { graduatedMonthlyAmount, TIER_RANGE_LABELS, type LandlordTier } from '@/lib/pricingTiers'

const MONTHS_SHOWN = 6

function monthKey(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function lastMonthKeys(n: number): string[] {
  const out: string[] = []
  const cursor = new Date()
  cursor.setDate(1)
  for (let i = 0; i < n; i++) {
    out.unshift(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
    cursor.setMonth(cursor.getMonth() - 1)
  }
  return out
}

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' })
}

function buildPoints(keys: string[], currentKey: string, valueByMonth: Record<string, number>): MonthPoint[] {
  return keys.map((key) => ({
    key,
    label: monthLabel(key),
    value: valueByMonth[key] || 0,
    isCurrent: key === currentKey,
  }))
}

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
  const [signupPoints, setSignupPoints] = useState<MonthPoint[]>([])
  const [rentPoints, setRentPoints] = useState<MonthPoint[]>([])
  const [jobPaymentPoints, setJobPaymentPoints] = useState<MonthPoint[]>([])
  const [mrrPoints, setMrrPoints] = useState<MonthPoint[]>([])
  const [hasMrrHistory, setHasMrrHistory] = useState(false)

  useEffect(() => {
    const load = async () => {
      const [
        usersRes,
        { data: subs, error: subsError },
        { data: rentPayments, error: rentError },
        { data: paidBids, error: bidsError },
        { data: disputes, error: disputesError },
        metricsTrendRes,
      ] = await Promise.all([
        fetch('/api/admin/users').then((r) => r.json()).catch(() => ({ users: [] })),
        supabase.from('landlord_subscriptions').select('tier, unit_count, status'),
        supabase.from('rent_payments').select('actual_amount, month'),
        supabase.from('bids').select('amount, proposed_amount, paid_at').eq('payment_status', 'paid'),
        supabase.from('disputes').select('id').eq('status', 'open'),
        fetch('/api/admin/metrics-trend').then((r) => r.json()).catch(() => ({ snapshots: [] })),
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

      // The graduated model has no single price per tier, so MRR is summed
      // from each active landlord's real unit count rather than a flat
      // per-tier lookup — a tier name alone can no longer say the dollar
      // amount.
      const mrr = (subs || [])
        .filter((s: any) => s.status === 'active' && s.tier !== 'free')
        .reduce((sum: number, s: any) => sum + graduatedMonthlyAmount(s.unit_count || 0), 0)

      const currentMonth = new Date().toISOString().slice(0, 7)
      const rentThisMonth = (rentPayments || [])
        .filter((p) => p.month?.startsWith(currentMonth))
        .reduce((sum, p) => sum + Number(p.actual_amount || 0), 0)

      const jobPaymentsAllTime = (paidBids || []).reduce((sum, b) => sum + Number(b.amount ?? 0), 0)

      setStats({ userCounts, tierCounts, mrr, rentThisMonth, jobPaymentsAllTime, openDisputes: disputes?.length || 0 })

      // --- Growth trends: last 6 months, from data already loaded above ---
      const months = lastMonthKeys(MONTHS_SHOWN)

      const signupsByMonth: Record<string, number> = {}
      ;(usersRes.users || []).forEach((u: any) => {
        if (!u.created_at) return
        const key = monthKey(u.created_at)
        signupsByMonth[key] = (signupsByMonth[key] || 0) + 1
      })

      const rentByMonth: Record<string, number> = {}
      ;(rentPayments || []).forEach((p: any) => {
        if (!p.month) return
        const key = String(p.month).slice(0, 7)
        rentByMonth[key] = (rentByMonth[key] || 0) + Number(p.actual_amount || 0)
      })

      const jobPaymentsByMonth: Record<string, number> = {}
      ;(paidBids || []).forEach((b: any) => {
        if (!b.paid_at) return
        const key = monthKey(b.paid_at)
        jobPaymentsByMonth[key] = (jobPaymentsByMonth[key] || 0) + Number(b.amount || 0)
      })

      setSignupPoints(buildPoints(months, currentMonth, signupsByMonth))
      setRentPoints(buildPoints(months, currentMonth, rentByMonth))
      setJobPaymentPoints(buildPoints(months, currentMonth, jobPaymentsByMonth))

      // MRR/subscriber growth only exists from whenever cron/metrics-snapshot
      // started running — there's no way to reconstruct it further back, so
      // this shows real recorded history rather than a fabricated one, and
      // says plainly when there isn't enough of it yet.
      const snapshots: any[] = metricsTrendRes.snapshots || []
      setHasMrrHistory(snapshots.length > 0)
      if (snapshots.length > 0) {
        const mrrByMonth: Record<string, number> = {}
        for (const s of snapshots) {
          // Latest snapshot per month wins — daily rows collapse to one
          // month-end-ish reading, which is what a monthly check-in wants.
          mrrByMonth[String(s.snapshot_date).slice(0, 7)] = Number(s.mrr || 0)
        }
        setMrrPoints(buildPoints(months, currentMonth, mrrByMonth))
      }

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
              {(['free', 'starter', 'growth', 'portfolio', 'enterprise'] as LandlordTier[]).map((key) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-white/60 text-sm capitalize">{key} <span className="text-white/30">· {TIER_RANGE_LABELS[key]}</span></span>
                  <span className="text-white text-sm font-medium">{stats.tierCounts[key] || 0}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>

          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-8">
            <h2 className="text-white font-semibold mb-2">Job payments processed</h2>
            <p className="text-white text-2xl font-bold">${stats.jobPaymentsAllTime.toLocaleString()}</p>
            <p className="text-white/50 text-xs mt-1">All-time total paid to contractors through Prophandld</p>
          </ScrollReveal>

          <h2 className="text-white font-semibold mb-4">Growth, last {MONTHS_SHOWN} months</h2>
          <ScrollReveal className="grid sm:grid-cols-2 gap-4 mb-4">
            <MonthlyBarChart
              title="New signups"
              subtitle="Landlords, renters and contractors combined"
              points={signupPoints}
              formatValue={(n) => String(n)}
            />
            <MonthlyBarChart
              title="Rent collected"
              subtitle="Actual amount received each month"
              points={rentPoints}
              formatValue={(n) => `$${n.toLocaleString()}`}
              color="#2DD4D9"
            />
            <MonthlyBarChart
              title="Job payments to contractors"
              subtitle="Paid out through Prophandld"
              points={jobPaymentPoints}
              formatValue={(n) => `$${n.toLocaleString()}`}
              color="#0A7B7E"
            />
            {hasMrrHistory ? (
              <MonthlyBarChart
                title="MRR"
                subtitle="Recorded daily starting when tracking began"
                points={mrrPoints}
                formatValue={(n) => `$${n.toLocaleString()}`}
                color="#12A5A9"
              />
            ) : (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-6 flex flex-col justify-center">
                <h2 className="text-white font-semibold">MRR trend</h2>
                <p className="text-white/50 text-xs mt-2 leading-relaxed">
                  There's no recorded history to chart yet — MRR was only ever computed live, never saved. Daily
                  tracking starts today; check back in a few weeks for a real trend line.
                </p>
              </div>
            )}
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
