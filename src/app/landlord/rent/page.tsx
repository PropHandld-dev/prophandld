'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { CountUp } from '@/components/CountUp'
import { DollarSignIcon, CheckCircleIcon } from '@/components/icons'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { fetchAllPagesOrEmpty } from '@/lib/pagedQuery'
import { useLanguage, t } from '@/lib/i18n'

function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type Row = {
  unitId: string
  propertyId: string
  unitLabel: string
  tenantName: string | null
  hasTenancy: boolean
  expected: number
  actual: number
  paid: boolean
  processing: boolean
  daysLate: number
  dueLabel: string
}

export default function RentRollPage() {
  const router = useRouter()
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [search, setSearch] = useState('')
  const [namesUnavailable, setNamesUnavailable] = useState(false)

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      setNamesUnavailable(false)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      // Paged rather than one query each: Supabase silently caps a single
      // response at 1000 rows and drops the rest with no error — the top
      // pricing tier now goes to 500+ units.
      const properties = await fetchAllPagesOrEmpty<{ id: string; address: string }>((from, to) =>
        supabase.from('properties').select('id, address').eq('owner_user_id', user.id).eq('archived', false).order('address').range(from, to)
      )
      const propertyIds = properties.map((p) => p.id)
      if (propertyIds.length === 0) {
        setRows([])
        setLoading(false)
        return
      }
      const propertyById = new Map(properties.map((p) => [p.id, p]))

      const units = await fetchAllPagesOrEmpty<{ id: string; unit_number: string; property_id: string }>((from, to) =>
        supabase.from('units').select('id, unit_number, property_id').in('property_id', propertyIds).order('unit_number').range(from, to)
      )
      const unitIds = units.map((u) => u.id)
      if (unitIds.length === 0) {
        setRows([])
        setLoading(false)
        return
      }

      const tenancies = await fetchAllPagesOrEmpty<{ id: string; unit_id: string; rent_amount: number; rent_due_day: number | null; renter_user_id: string }>((from, to) =>
        supabase
          .from('tenancies')
          .select('id, unit_id, rent_amount, rent_due_day, renter_user_id')
          .in('unit_id', unitIds)
          .eq('ended', false)
          .order('created_at', { ascending: false })
          .range(from, to)
      )
      // Ordered newest-first above so that if a unit ever somehow ends up
      // with more than one non-ended tenancy (no DB constraint prevents
      // it), keeping only the first occurrence per unit deterministically
      // picks the most recent one — same guard the per-unit rent page
      // already uses, rather than whatever order Postgres happens to
      // return duplicates in.
      const tenancyByUnit = new Map<string, typeof tenancies[number]>()
      for (const tn of tenancies) {
        if (!tenancyByUnit.has(tn.unit_id)) tenancyByUnit.set(tn.unit_id, tn)
      }
      const tenancyIds = tenancies.map((tn) => tn.id)

      // Neither depends on the other's result (both only need tenancyIds/
      // renterIds, already known at this point) — run them together
      // instead of one extra avoidable round trip in sequence.
      const renterIds = Array.from(new Set(tenancies.map((tn) => tn.renter_user_id).filter(Boolean)))
      const thisMonth = currentMonthKey()
      const [{ data: renters, error: rentersError }, payments] = await Promise.all([
        renterIds.length
          ? supabase.rpc('get_users_by_ids', { user_ids_input: renterIds })
          : Promise.resolve({ data: [] as any[], error: null }),
        tenancyIds.length
          ? fetchAllPagesOrEmpty<{ tenancy_id: string; month: string; expected_amount: number; actual_amount: number; stripe_status: string | null }>((from, to) =>
              supabase
                .from('rent_payments')
                .select('tenancy_id, month, expected_amount, actual_amount, stripe_status')
                .in('tenancy_id', tenancyIds)
                .gte('month', `${thisMonth}-01`)
                .lte('month', `${thisMonth}-28`)
                .range(from, to)
            )
          : Promise.resolve([]),
      ])
      if (rentersError) {
        console.error('rent roll: could not load tenant names', rentersError)
        setNamesUnavailable(true)
      }
      const renterById = new Map<string, string | null>((renters || []).map((r: any) => [r.id as string, r.full_name as string | null]))
      const paymentByTenancy = new Map(payments.map((p) => [p.tenancy_id, p]))

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const builtRows: Row[] = units.map((unit) => {
        const property = propertyById.get(unit.property_id)
        const tenancy = tenancyByUnit.get(unit.id)
        const unitLabel = `${property?.address || t('unknownLabel', lang)} · ${unit.unit_number}`

        if (!tenancy) {
          return { unitId: unit.id, propertyId: unit.property_id, unitLabel, tenantName: null, hasTenancy: false, expected: 0, actual: 0, paid: false, processing: false, daysLate: 0, dueLabel: '' }
        }

        const payment = paymentByTenancy.get(tenancy.id)
        const expected = Number(payment?.expected_amount ?? tenancy.rent_amount ?? 0)
        const actual = Number(payment?.actual_amount || 0)
        const paid = expected > 0 && actual >= expected
        const processing = !paid && payment?.stripe_status === 'processing'

        const [y, m] = thisMonth.split('-').map(Number)
        const dueDate = new Date(y, m - 1, tenancy.rent_due_day || 1)
        const daysLate = Math.round((today.getTime() - dueDate.getTime()) / 86400000)
        const dueLabel = dueDate.toLocaleDateString(lang === 'es' ? 'es-ES' : undefined, { month: 'short', day: 'numeric' })

        return {
          unitId: unit.id,
          propertyId: unit.property_id,
          unitLabel,
          tenantName: renterById.get(tenancy.renter_user_id) || null,
          hasTenancy: true,
          expected,
          actual,
          paid,
          processing,
          daysLate,
          dueLabel,
        }
      })

      // Tenants needing attention first (late, then due, then processing),
      // paid tenants after, vacant units last — this is a "what do I need
      // to look at" list, not an alphabetical directory.
      builtRows.sort((a, b) => {
        const rank = (r: Row) => (!r.hasTenancy ? 3 : r.paid ? 2 : r.processing ? 1 : 0)
        const ra = rank(a)
        const rb = rank(b)
        if (ra !== rb) return ra - rb
        if (ra === 0) return b.daysLate - a.daysLate
        return a.unitLabel.localeCompare(b.unitLabel)
      })

      setRows(builtRows)
      setLoading(false)
    }
    init()
  }, [router])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.unitLabel.toLowerCase().includes(q) || r.tenantName?.toLowerCase().includes(q))
  }, [rows, search])

  const stats = useMemo(() => {
    let expected = 0
    let collected = 0
    for (const row of filteredRows) {
      if (!row.hasTenancy) continue
      expected += row.expected
      collected += row.actual
    }
    return { expected, collected, pct: expected > 0 ? Math.round((collected / expected) * 100) : 0 }
  }, [filteredRows])

  const pillFor = (row: Row) => {
    if (!row.hasTenancy) return { text: t('noTenantLabel', lang), style: 'bg-white/5 text-white/35' }
    if (row.paid) return { text: t('paidStatus', lang), style: 'bg-[#0A7B7E]/20 text-[#12A5A9]' }
    if (row.processing) return { text: t('bankPaymentProcessing', lang), style: 'bg-yellow-500/15 text-yellow-400' }
    if (row.daysLate > 0) return { text: `${row.daysLate} ${t('dayLateSuffix', lang)}`, style: 'bg-red-500/15 text-red-400' }
    return { text: `${t('dueDatePrefix', lang)} ${row.dueLabel}`, style: 'bg-white/8 text-white/60' }
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">
          {t('backToDashboardArrowPlain', lang)}
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">{t('rentRollHeading', lang)}</h1>
          <p className="text-white/50 text-sm mt-1">{t('rentRollSubtitle', lang)}</p>
        </div>

        {namesUnavailable && (
          <div className="bg-yellow-500/8 border border-yellow-500/25 rounded-xl px-4 py-3 text-yellow-400 text-sm mb-6">
            {t('tenantNamesUnavailable', lang)}
          </div>
        )}

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPropertyOrUnit', lang)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition mb-6"
        />

        {!loading && rows.length > 0 && (
          <ScrollReveal>
            <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSignIcon className="w-4 h-4 text-white/50" />
                </div>
                <p className="text-white/60 text-xs">{t('expectedStatLabel', lang)}</p>
                <CountUp value={Math.round(stats.expected)} format={(n) => n.toLocaleString()} className="text-xl font-bold text-white tabular-nums" />
              </div>
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircleIcon className="w-4 h-4 text-[#12A5A9]" />
                </div>
                <p className="text-white/60 text-xs">{t('collectedStatLabel', lang)}</p>
                <CountUp value={Math.round(stats.collected)} format={(n) => n.toLocaleString()} className="text-xl font-bold text-[#12A5A9] tabular-nums" />
              </div>
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white/50 text-xs">%</span>
                </div>
                <p className="text-white/60 text-xs">{t('collectedRateStatLabel', lang)}</p>
                <p className="text-xl font-bold text-white tabular-nums"><CountUp value={stats.pct} />%</p>
              </div>
            </div>
          </ScrollReveal>
        )}

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">{t('noUnitsYet', lang)}</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">{t('noUnitsMatchSearch', lang)}</p>
          </div>
        ) : (
          <ScrollReveal>
            <div className="space-y-2.5">
              {filteredRows.map((row) => {
                const pill = pillFor(row)
                return (
                  <Link
                    key={row.unitId}
                    href={`/landlord/properties/${row.propertyId}/units/${row.unitId}/rent`}
                    className={`flex items-center justify-between gap-4 bg-white/3 border border-white/8 rounded-2xl px-5 py-4 transition hover:bg-white/5 hover:border-white/15 ${!row.hasTenancy ? 'opacity-60' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate">{row.tenantName || row.unitLabel}</p>
                      {row.tenantName && <p className="text-white/40 text-xs truncate mt-0.5">{row.unitLabel}</p>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {row.hasTenancy && <span className="text-white text-sm font-semibold tabular-nums hidden sm:inline">${row.expected.toLocaleString()}</span>}
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${pill.style}`}>{pill.text}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </ScrollReveal>
        )}
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
