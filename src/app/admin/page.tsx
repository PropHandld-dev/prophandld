'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'
import { MonthlyBarChart, type MonthPoint } from '@/components/admin/MonthlyBarChart'
import { StackedMonthlyBarChart, type StackedSeries, type StackedMonthPoint } from '@/components/admin/StackedMonthlyBarChart'
import { graduatedMonthlyAmount, TIER_RANGE_LABELS, type LandlordTier } from '@/lib/pricingTiers'

const ROLE_COLORS: Record<'landlord' | 'renter' | 'contractor', string> = {
  landlord: '#12A5A9',
  renter: '#2DD4D9',
  contractor: '#5E7189',
}

const TIER_COLORS: Record<LandlordTier, string> = {
  free: '#3A4C64',
  starter: '#0A7B7E',
  growth: '#12A5A9',
  portfolio: '#2DD4D9',
  enterprise: '#7FEAEC',
}

const MONTHS_SHOWN = 6

// Stripe's standard US card rate — used only to estimate the processing
// fee Prophandld absorbs on job payments (the "no platform fee, ever"
// promise to contractors means that cost comes straight out of the
// platform, not the contractor). This is a directional estimate for a
// weekly check-in, not real accounting — Stripe's actual fee varies by
// card type/country and this doesn't attempt to match it to the cent.
const CARD_FEE_RATE = 0.029
const CARD_FEE_FIXED = 0.30
// ACH: 0.8%, capped at $5 — Stripe's standard bank-transfer rate.
const ACH_FEE_RATE = 0.008
const ACH_FEE_CAP = 5

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
    stripeFeesThisMonth: number
  } | null>(null)
  const [infraCost, setInfraCost] = useState(0)
  const [infraCostDraft, setInfraCostDraft] = useState('')
  const [editingInfraCost, setEditingInfraCost] = useState(false)
  const [savingInfraCost, setSavingInfraCost] = useState(false)
  const [signupSeries, setSignupSeries] = useState<StackedSeries[]>([])
  const [rentPoints, setRentPoints] = useState<MonthPoint[]>([])
  const [jobPaymentPoints, setJobPaymentPoints] = useState<MonthPoint[]>([])
  const [mrrPoints, setMrrPoints] = useState<MonthPoint[]>([])
  const [tierSeries, setTierSeries] = useState<StackedSeries[]>([])
  const [hasMrrHistory, setHasMrrHistory] = useState(false)
  const [hasTierHistory, setHasTierHistory] = useState(false)
  const [monthPoints, setMonthPoints] = useState<StackedMonthPoint[]>([])

  const loadCostSettings = async () => {
    const res = await fetch('/api/admin/cost-settings')
    const data = await res.json().catch(() => null)
    if (data && typeof data.monthlyInfraCost === 'number') setInfraCost(data.monthlyInfraCost)
  }

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
        supabase.from('rent_payments').select('actual_amount, month, card_surcharge_amount'),
        supabase.from('bids').select('amount, proposed_amount, paid_at').eq('payment_status', 'paid'),
        supabase.from('disputes').select('id').eq('status', 'open'),
        fetch('/api/admin/metrics-trend').then((r) => r.json()).catch(() => ({ snapshots: [] })),
      ])
      await loadCostSettings()

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
      const rentPaymentsThisMonth = (rentPayments || []).filter((p: any) => p.month?.startsWith(currentMonth))
      const rentThisMonth = rentPaymentsThisMonth.reduce((sum: number, p: any) => sum + Number(p.actual_amount || 0), 0)

      const jobPaymentsAllTime = (paidBids || []).reduce((sum, b) => sum + Number(b.amount ?? 0), 0)

      // Job payments: Prophandld absorbs the full card fee (contractors
      // keep 100% of their bid). Rent: a card payment already collected a
      // surcharge to cover this (see cardSurcharge.ts), so only ACH rent
      // payments (no surcharge) cost the platform anything here.
      const jobFeesThisMonth = (paidBids || [])
        .filter((b: any) => b.paid_at && monthKey(b.paid_at) === currentMonth)
        .reduce((sum: number, b: any) => sum + Number(b.amount || 0) * CARD_FEE_RATE + CARD_FEE_FIXED, 0)
      const rentAchFeesThisMonth = rentPaymentsThisMonth
        .filter((p: any) => !p.card_surcharge_amount || Number(p.card_surcharge_amount) === 0)
        .reduce((sum: number, p: any) => sum + Math.min(Number(p.actual_amount || 0) * ACH_FEE_RATE, ACH_FEE_CAP), 0)
      const stripeFeesThisMonth = jobFeesThisMonth + rentAchFeesThisMonth

      setStats({ userCounts, tierCounts, mrr, rentThisMonth, jobPaymentsAllTime, openDisputes: disputes?.length || 0, stripeFeesThisMonth })

      // --- Growth trends: last 6 months, from data already loaded above ---
      const months = lastMonthKeys(MONTHS_SHOWN)
      setMonthPoints(months.map((key) => ({ key, label: monthLabel(key), isCurrent: key === currentMonth })))

      const signupsByRoleMonth: Record<'landlord' | 'renter' | 'contractor', Record<string, number>> = {
        landlord: {}, renter: {}, contractor: {},
      }
      ;(usersRes.users || []).forEach((u: any) => {
        if (!u.created_at || !u.role) return
        if (u.role !== 'landlord' && u.role !== 'renter' && u.role !== 'contractor') return
        const key = monthKey(u.created_at)
        signupsByRoleMonth[u.role as 'landlord' | 'renter' | 'contractor'][key] =
          (signupsByRoleMonth[u.role as 'landlord' | 'renter' | 'contractor'][key] || 0) + 1
      })
      setSignupSeries([
        { key: 'landlord', label: 'Landlords', color: ROLE_COLORS.landlord, valuesByMonth: signupsByRoleMonth.landlord },
        { key: 'renter', label: 'Renters', color: ROLE_COLORS.renter, valuesByMonth: signupsByRoleMonth.renter },
        { key: 'contractor', label: 'Contractors', color: ROLE_COLORS.contractor, valuesByMonth: signupsByRoleMonth.contractor },
      ])

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

        const tierKeys: LandlordTier[] = ['free', 'starter', 'growth', 'portfolio', 'enterprise']
        const tierColByMonth: Record<LandlordTier, Record<string, number>> = {
          free: {}, starter: {}, growth: {}, portfolio: {}, enterprise: {},
        }
        for (const s of snapshots) {
          const key = String(s.snapshot_date).slice(0, 7)
          tierColByMonth.free[key] = Number(s.tier_free_count || 0)
          tierColByMonth.starter[key] = Number(s.tier_starter_count || 0)
          tierColByMonth.growth[key] = Number(s.tier_growth_count || 0)
          tierColByMonth.portfolio[key] = Number(s.tier_portfolio_count || 0)
          tierColByMonth.enterprise[key] = Number(s.tier_enterprise_count || 0)
        }
        setTierSeries(
          tierKeys.map((key) => ({
            key,
            label: key.charAt(0).toUpperCase() + key.slice(1),
            color: TIER_COLORS[key],
            valuesByMonth: tierColByMonth[key],
          }))
        )
        setHasTierHistory(true)
      }

      setLoading(false)
    }
    load()
  }, [])

  const startEditingInfraCost = () => {
    setInfraCostDraft(infraCost.toFixed(2))
    setEditingInfraCost(true)
  }

  const saveInfraCost = async () => {
    const value = parseFloat(infraCostDraft)
    if (Number.isNaN(value) || value < 0) return
    setSavingInfraCost(true)
    const res = await fetch('/api/admin/cost-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyInfraCost: value }),
    })
    if (res.ok) {
      setInfraCost(value)
      setEditingInfraCost(false)
    }
    setSavingInfraCost(false)
  }

  const netMonthly = stats ? stats.mrr - stats.stripeFeesThisMonth - infraCost : 0

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-white/40 text-sm mt-1">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {loading || !stats ? (
        <div className="text-white/50 text-sm">Loading...</div>
      ) : (
        <>
          <SectionHeading title="This month" />
          <ScrollReveal className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-10">
            <StatCard label="Landlords" value={stats.userCounts.landlord || 0} />
            <StatCard label="Renters" value={stats.userCounts.renter || 0} />
            <StatCard label="Contractors" value={stats.userCounts.contractor || 0} />
            <StatCard label="Rent collected" value={`$${stats.rentThisMonth.toLocaleString()}`} />
            <StatCard label="Job payments, all-time" value={`$${stats.jobPaymentsAllTime.toLocaleString()}`} />
            <StatCard label="Open disputes" value={stats.openDisputes} tone={stats.openDisputes > 0 ? 'yellow' : undefined} />
          </ScrollReveal>

          <SectionHeading title="Economics" subtitle="Real revenue, real costs, and what's actually left over — the numbers for the weekly meeting" />
          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-10">
            <div className="grid sm:grid-cols-4 gap-6">
              <EconLine label="Revenue" sublabel="Subscription MRR" value={stats.mrr} tone="positive" />
              <EconLine label="Stripe fees absorbed" sublabel="Estimated, this month" value={-stats.stripeFeesThisMonth} tone="negative" />
              <EconLine
                label="Infrastructure"
                sublabel="Vercel · Supabase · Resend · Twilio"
                value={-infraCost}
                tone="negative"
                editable
                editing={editingInfraCost}
                draft={infraCostDraft}
                onDraftChange={setInfraCostDraft}
                onStartEdit={startEditingInfraCost}
                onSave={saveInfraCost}
                onCancel={() => setEditingInfraCost(false)}
                saving={savingInfraCost}
              />
              <EconLine label="Net" sublabel="Per month" value={netMonthly} tone={netMonthly >= 0 ? 'positive' : 'negative'} emphasize />
            </div>
            <p className="text-white/30 text-[11px] mt-6 leading-relaxed">
              Stripe fees are a directional estimate (standard card/ACH rates applied to real payment amounts), not exact accounting.
              Infrastructure is a number you keep current yourself, click it to update.
            </p>
          </ScrollReveal>

          <SectionHeading title="Subscription mix" />
          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-10">
            <div className="space-y-2">
              {(['free', 'starter', 'growth', 'portfolio', 'enterprise'] as LandlordTier[]).map((key) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-white/60 text-sm capitalize">{key} <span className="text-white/30">· {TIER_RANGE_LABELS[key]}</span></span>
                  <span className="text-white text-sm font-medium">{stats.tierCounts[key] || 0}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>

          <SectionHeading title={`Growth, last ${MONTHS_SHOWN} months`} />
          <ScrollReveal className="grid sm:grid-cols-2 gap-4 mb-4">
            <StackedMonthlyBarChart
              title="New signups"
              subtitle="By role"
              months={monthPoints}
              series={signupSeries}
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
                  There's no recorded history to chart yet. MRR was only ever computed live, never saved. Daily
                  tracking starts today; check back in a few weeks for a real trend line.
                </p>
              </div>
            )}
            {hasTierHistory ? (
              <StackedMonthlyBarChart
                title="Subscription tier mix"
                subtitle="How many landlords are in each tier"
                months={monthPoints}
                series={tierSeries}
              />
            ) : (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-6 flex flex-col justify-center">
                <h2 className="text-white font-semibold">Subscription tier mix trend</h2>
                <p className="text-white/50 text-xs mt-2 leading-relaxed">
                  Same as MRR, recorded from today forward. Today's snapshot is the "Subscription mix" card above;
                  check back in a few weeks for how that mix moves over time.
                </p>
              </div>
            )}
          </ScrollReveal>
        </>
      )}
    </AdminLayout>
  )
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider">{title}</h2>
      {subtitle && <p className="text-white/30 text-xs mt-1">{subtitle}</p>}
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: 'yellow' }) {
  return (
    <div className="bg-white/3 border border-white/8 rounded-xl p-4 text-center">
      <div className={`text-xl font-bold tabular-nums ${tone === 'yellow' ? 'text-yellow-400' : 'text-white'}`}>{value}</div>
      <div className="text-white/60 text-xs mt-0.5">{label}</div>
    </div>
  )
}

function EconLine({
  label,
  sublabel,
  value,
  tone,
  emphasize,
  editable,
  editing,
  draft,
  onDraftChange,
  onStartEdit,
  onSave,
  onCancel,
  saving,
}: {
  label: string
  sublabel: string
  value: number
  tone: 'positive' | 'negative'
  emphasize?: boolean
  editable?: boolean
  editing?: boolean
  draft?: string
  onDraftChange?: (v: string) => void
  onStartEdit?: () => void
  onSave?: () => void
  onCancel?: () => void
  saving?: boolean
}) {
  const formatted = `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  return (
    <div>
      <div className="text-white/50 text-xs">{label}</div>
      <div className="text-white/25 text-[11px] mb-1.5">{sublabel}</div>
      {editable && editing ? (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            step="0.01"
            min="0"
            value={draft}
            onChange={(e) => onDraftChange?.(e.target.value)}
            autoFocus
            className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-lg font-bold tabular-nums focus:outline-none focus:border-[#12A5A9] transition"
          />
          <button onClick={onSave} disabled={saving} className="text-[#12A5A9] text-xs font-semibold hover:underline disabled:opacity-50">
            {saving ? '...' : 'Save'}
          </button>
          <button onClick={onCancel} className="text-white/40 text-xs hover:text-white/60 transition">
            Cancel
          </button>
        </div>
      ) : (
        <div
          className={`${emphasize ? 'text-2xl' : 'text-xl'} font-bold tabular-nums ${tone === 'positive' ? 'text-[#12A5A9]' : 'text-white'} ${editable ? 'cursor-pointer hover:underline decoration-dashed underline-offset-4' : ''}`}
          onClick={editable ? onStartEdit : undefined}
          title={editable ? 'Click to update' : undefined}
        >
          {formatted}
          {editable && <span className="text-white/30 text-xs font-normal ml-1.5">edit</span>}
        </div>
      )}
    </div>
  )
}
