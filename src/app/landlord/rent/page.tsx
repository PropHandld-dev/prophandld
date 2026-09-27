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
import { useLanguage, t } from '@/lib/i18n'

// A custom range is capped rather than unbounded — a portfolio can run
// years of history, and a 2-year-wide table is already about as much as
// this layout can usefully show at once before search/scroll do more work
// than the extra columns are worth.
const MAX_CUSTOM_MONTHS = 24
const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3]

type RangeValue = 'recent3' | 'recent6' | 'recent12' | `year-${number}` | 'custom'

// 'YYYY-MM' for the last `count` months, oldest first, ending at the
// current month.
function recentMonthKeys(count: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

function yearMonthKeys(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}

// Inclusive 'YYYY-MM' range, oldest first. A reversed or absurd input just
// comes back empty/capped rather than hanging or erroring — this only ever
// feeds a date filter and a table width, nothing structural depends on it.
function customRangeKeys(from: string, to: string): string[] {
  if (!from || !to) return []
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  if (!fy || !fm || !ty || !tm) return []
  const out: string[] = []
  let y = fy
  let m = fm
  while ((y < ty || (y === ty && m <= tm)) && out.length < MAX_CUSTOM_MONTHS) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

function monthsForRange(range: RangeValue, customFrom: string, customTo: string): string[] {
  if (range === 'custom') return customRangeKeys(customFrom, customTo)
  if (range.startsWith('year-')) return yearMonthKeys(Number(range.slice(5)))
  return recentMonthKeys(range === 'recent3' ? 3 : range === 'recent12' ? 12 : 6)
}

const monthLabel = (key: string, lang: 'en' | 'es', withYear = false) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(lang === 'es' ? 'es-ES' : undefined, withYear ? { month: 'short', year: '2-digit' } : { month: 'short' })
}

type Cell = { status: 'paid' | 'partial' | 'unpaid' | 'no-tenant'; expected?: number; actual?: number; paymentId?: string }
type Row = { unitId: string; propertyId: string; label: string; hasTenancy: boolean; cells: Record<string, Cell> }

export default function RentRollPage() {
  const router = useRouter()
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<RangeValue>('recent6')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const months = useMemo(() => monthsForRange(range, customFrom, customTo), [range, customFrom, customTo])
  // A year spans past and future months alike — showing a year's worth of
  // columns needs the year, not just "Jan/Feb/…", to stay readable months
  // after the fact. Everything else is close enough to "now" that the
  // month alone reads fine.
  const showYearInHeader = range.startsWith('year-') || range === 'custom'

  useEffect(() => {
    if (months.length === 0) {
      setRows([])
      setLoading(false)
      return
    }

    const init = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: properties } = await supabase
        .from('properties')
        .select('id, address')
        .eq('owner_user_id', user.id)
        .eq('archived', false)
        .order('address')

      const propertyIds = (properties || []).map((p) => p.id)
      if (propertyIds.length === 0) {
        setRows([])
        setLoading(false)
        return
      }
      const propertyById = new Map((properties || []).map((p) => [p.id, p]))

      const { data: units } = await supabase
        .from('units')
        .select('id, unit_number, property_id')
        .in('property_id', propertyIds)
        .order('unit_number')

      const unitIds = (units || []).map((u) => u.id)
      if (unitIds.length === 0) {
        setRows([])
        setLoading(false)
        return
      }

      const { data: tenancies } = await supabase
        .from('tenancies')
        .select('id, unit_id, rent_amount')
        .in('unit_id', unitIds)
        .eq('ended', false)

      const tenancyByUnit = new Map((tenancies || []).map((t) => [t.unit_id, t]))
      const tenancyIds = (tenancies || []).map((t) => t.id)

      const earliestMonth = `${months[0]}-01`
      const latestMonth = `${months[months.length - 1]}-01`
      const { data: payments } = tenancyIds.length
        ? await supabase
            .from('rent_payments')
            .select('id, tenancy_id, month, expected_amount, actual_amount')
            .in('tenancy_id', tenancyIds)
            .gte('month', earliestMonth)
            .lte('month', latestMonth)
        : { data: [] as any[] }

      const paymentsByTenancyMonth = new Map<string, any>()
      for (const p of payments || []) {
        const key = `${p.tenancy_id}:${String(p.month).slice(0, 7)}`
        paymentsByTenancyMonth.set(key, p)
      }

      const builtRows: Row[] = (units || []).map((unit) => {
        const property = propertyById.get(unit.property_id)
        const tenancy = tenancyByUnit.get(unit.id)
        const cells: Record<string, Cell> = {}
        for (const m of months) {
          if (!tenancy) {
            cells[m] = { status: 'no-tenant' }
            continue
          }
          const payment = paymentsByTenancyMonth.get(`${tenancy.id}:${m}`)
          if (!payment) {
            cells[m] = { status: 'no-tenant' } // no row generated for this month yet
            continue
          }
          const expected = Number(payment.expected_amount || 0)
          const actual = Number(payment.actual_amount || 0)
          cells[m] = {
            status: actual >= expected && expected > 0 ? 'paid' : actual > 0 ? 'partial' : 'unpaid',
            expected,
            actual,
            paymentId: payment.id,
          }
        }
        return {
          unitId: unit.id,
          propertyId: unit.property_id,
          label: `${property?.address || 'Unknown'} · ${unit.unit_number}`,
          hasTenancy: !!tenancy,
          cells,
        }
      })

      setRows(builtRows)
      setLoading(false)
    }
    init()
  }, [router, months.join(',')])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.label.toLowerCase().includes(q))
  }, [rows, search])

  // Stats follow the same filter the table does — "what am I looking at
  // right now", not a separate portfolio-wide figure that wouldn't match
  // the rows on screen.
  const statsMonth = months[months.length - 1]
  const stats = useMemo(() => {
    if (!statsMonth) return { expected: 0, collected: 0, pct: 0 }
    let expected = 0
    let collected = 0
    for (const row of filteredRows) {
      const cell = row.cells[statsMonth]
      if (!cell || cell.status === 'no-tenant') continue
      expected += cell.expected || 0
      collected += cell.actual || 0
    }
    return { expected, collected, pct: expected > 0 ? Math.round((collected / expected) * 100) : 0 }
  }, [filteredRows, statsMonth])

  const cellStyle = (status: Cell['status']) => {
    if (status === 'paid') return 'bg-[#12A5A9]/15 text-[#12A5A9]'
    if (status === 'partial') return 'bg-yellow-500/15 text-yellow-400'
    if (status === 'unpaid') return 'bg-red-500/10 text-red-400'
    return 'bg-white/3 text-white/25'
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

      <main className="max-w-5xl mx-auto px-6 py-10 pb-28">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">{t('rentRollHeading', lang)}</h1>
          <p className="text-white/50 text-sm mt-1">{t('rentRollSubtitle', lang)}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPropertyOrUnit', lang)}
            className="flex-1 min-w-[180px] bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
          />
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as RangeValue)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
          >
            <option value="recent3" className="bg-[#0C1A2E]">{t('last3MonthsOption', lang)}</option>
            <option value="recent6" className="bg-[#0C1A2E]">{t('last6MonthsOption', lang)}</option>
            <option value="recent12" className="bg-[#0C1A2E]">{t('last12MonthsOption', lang)}</option>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={`year-${y}`} className="bg-[#0C1A2E]">{y}</option>
            ))}
            <option value="custom" className="bg-[#0C1A2E]">{t('customRangeOption', lang)}</option>
          </select>
          {range === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition [color-scheme:dark]"
              />
              <span className="text-white/40 text-sm">{t('toWord', lang)}</span>
              <input
                type="month"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition [color-scheme:dark]"
              />
            </div>
          )}
        </div>

        {!loading && months.length > 0 && rows.length > 0 && (
          <ScrollReveal>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSignIcon className="w-4 h-4 text-white/50" />
                  <span className="text-white/50 text-xs">{monthLabel(statsMonth, lang, showYearInHeader)}</span>
                </div>
                <p className="text-white/60 text-xs">{t('expectedStatLabel', lang)}</p>
                <CountUp value={Math.round(stats.expected)} className="text-xl font-bold text-white tabular-nums" />
              </div>
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircleIcon className="w-4 h-4 text-[#12A5A9]" />
                  <span className="text-white/50 text-xs">{monthLabel(statsMonth, lang, showYearInHeader)}</span>
                </div>
                <p className="text-white/60 text-xs">{t('collectedStatLabel', lang)}</p>
                <CountUp value={Math.round(stats.collected)} className="text-xl font-bold text-[#12A5A9] tabular-nums" />
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
            <Skeleton className="h-10" />
            <Skeleton className="h-64" />
          </div>
        ) : months.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">{t('pickACustomRangeMsg', lang)}</p>
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
            <div className="overflow-x-auto bg-white/3 border border-white/8 rounded-2xl">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/8">
                    <th className="sticky left-0 z-10 bg-[#101f36] text-left text-white/50 text-xs font-medium uppercase tracking-wide px-4 py-3 min-w-[180px]">
                      {t('unitColumnHeading', lang)}
                    </th>
                    {months.map((m) => (
                      <th key={m} className="text-center text-white/50 text-xs font-medium uppercase tracking-wide px-2 py-3 min-w-[56px]">
                        {monthLabel(m, lang, showYearInHeader)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.unitId} className="border-b border-white/5 last:border-0">
                      <td className="sticky left-0 z-10 bg-[#0c1a2e] px-4 py-3">
                        <Link
                          href={`/landlord/properties/${row.propertyId}/units/${row.unitId}/rent`}
                          className="text-white text-sm hover:text-[#12A5A9] transition truncate block max-w-[220px]"
                        >
                          {row.label}
                        </Link>
                        {!row.hasTenancy && <span className="text-white/30 text-xs">{t('noTenantLabel', lang)}</span>}
                      </td>
                      {months.map((m) => {
                        const cell = row.cells[m]
                        return (
                          <td key={m} className="px-2 py-3 text-center">
                            <Link
                              href={`/landlord/properties/${row.propertyId}/units/${row.unitId}/rent`}
                              className={`inline-flex items-center justify-center w-14 h-9 rounded-lg text-xs font-semibold transition hover:opacity-80 ${cellStyle(cell.status)}`}
                              title={cell.expected ? `${t('expectedDollarPrefix', lang)}${cell.expected} ${t('paidDollarPrefix', lang)}${cell.actual}` : undefined}
                            >
                              {cell.status === 'paid' ? '✓' : cell.status === 'partial' ? '½' : cell.status === 'unpaid' ? '✕' : '—'}
                            </Link>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 text-xs text-white/50 flex-wrap mt-4">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#12A5A9]/40" /> {t('paidLegend', lang)}</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-500/40" /> {t('partialLegend', lang)}</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/40" /> {t('unpaidLegend', lang)}</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white/10" /> {t('noTenantNoRecordLegend', lang)}</span>
            </div>
          </ScrollReveal>
        )}
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
