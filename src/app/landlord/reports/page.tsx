'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { CountUp } from '@/components/CountUp'
import { Logo } from '@/components/Logo'
import { RippleButton } from '@/components/RippleButton'
import { DollarSignIcon, ReceiptIcon, DownloadIcon, PrinterIcon } from '@/components/icons'
import { fetchAllPagesOrEmpty } from '@/lib/pagedQuery'
import { downloadCsv } from '@/lib/csvExport'
import { graduatedMonthlyAmount } from '@/lib/pricingTiers'
import { useLanguage, t } from '@/lib/i18n'

type Property = { id: string; address: string; city: string | null; state: string | null }
type Unit = { id: string; unit_number: string; property_id: string }

type RentRow = {
  id: string
  date: string // paid_date
  propertyId: string
  place: string
  amount: number
  method: 'bank' | 'card' | null
}

type JobRow = {
  id: string // bid id, for the receipt link
  date: string // paid_at
  propertyId: string
  place: string
  category: string
  contractorName: string
  amount: number
}

type Preset = 'thisYear' | 'lastYear' | 'allTime' | 'custom'

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function presetRange(preset: Preset): { from: string; to: string } {
  const now = new Date()
  const year = now.getFullYear()
  if (preset === 'lastYear') return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
  if (preset === 'allTime') return { from: '2020-01-01', to: isoDate(now) }
  return { from: `${year}-01-01`, to: isoDate(now) } // thisYear
}

// A landlord's own half of the picture contractors already get on their
// Earnings page — what came in (rent) and what went out (contractor
// payments), per property, exportable for tax time. Pulled with explicit
// property → unit → payment scoping (same shape as the Rent Roll page),
// not left to RLS alone — the one place in the app where getting the
// ownership boundary wrong would leak another landlord's real numbers.
export default function LandlordReportsPage() {
  const router = useRouter()
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [landlordName, setLandlordName] = useState('')
  const [properties, setProperties] = useState<Property[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [rentRows, setRentRows] = useState<RentRow[]>([])
  const [jobRows, setJobRows] = useState<JobRow[]>([])
  const [unitCount, setUnitCount] = useState(0)

  const [preset, setPreset] = useState<Preset>('thisYear')
  const [customFrom, setCustomFrom] = useState(presetRange('thisYear').from)
  const [customTo, setCustomTo] = useState(presetRange('thisYear').to)
  const [propertyFilter, setPropertyFilter] = useState('all')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setLandlordName((user.user_metadata as any)?.full_name || '')

      const props = await fetchAllPagesOrEmpty<Property>((from, to) =>
        supabase.from('properties').select('id, address, city, state').eq('owner_user_id', user.id).eq('archived', false).order('address').range(from, to)
      )
      setProperties(props)
      const propertyIds = props.map((p) => p.id)
      if (propertyIds.length === 0) {
        setLoading(false)
        return
      }

      const unitsList = await fetchAllPagesOrEmpty<Unit>((from, to) =>
        supabase.from('units').select('id, unit_number, property_id').in('property_id', propertyIds).range(from, to)
      )
      setUnits(unitsList)
      setUnitCount(unitsList.length)
      const unitIds = unitsList.map((u) => u.id)
      if (unitIds.length === 0) {
        setLoading(false)
        return
      }
      const propertyOfUnit = new Map(unitsList.map((u) => [u.id, u.property_id]))
      const placeOf = (unitId: string) => {
        const pid = propertyOfUnit.get(unitId)
        const p = props.find((pp) => pp.id === pid)
        const u = unitsList.find((uu) => uu.id === unitId)
        return p ? `${p.address}${u?.unit_number ? `, Unit ${u.unit_number}` : ''}` : t('unitFallback', lang)
      }

      // Rent: scoped via tenancies on these units (same two-step shape as
      // the Rent Roll page), not filtered by date here — full history is
      // fetched once and every date-range change below is then instant,
      // client-side, no refetch.
      const tenancies = await fetchAllPagesOrEmpty<{ id: string; unit_id: string }>((from, to) =>
        supabase.from('tenancies').select('id, unit_id').in('unit_id', unitIds).range(from, to)
      )
      const tenancyIds = tenancies.map((tn) => tn.id)
      const tenancyUnit = new Map(tenancies.map((tn) => [tn.id, tn.unit_id]))

      const [rentPayments, jobsList] = await Promise.all([
        tenancyIds.length
          ? fetchAllPagesOrEmpty<{ id: string; tenancy_id: string; actual_amount: number; paid_date: string | null; payment_method: string | null }>((from, to) =>
              supabase
                .from('rent_payments')
                .select('id, tenancy_id, actual_amount, paid_date, payment_method')
                .in('tenancy_id', tenancyIds)
                .gt('actual_amount', 0)
                .not('paid_date', 'is', null)
                .range(from, to)
            )
          : Promise.resolve([]),
        fetchAllPagesOrEmpty<{ id: string; unit_id: string; category: string }>((from, to) =>
          supabase.from('jobs').select('id, unit_id, category').in('unit_id', unitIds).range(from, to)
        ),
      ])

      setRentRows(
        rentPayments.map((rp) => ({
          id: rp.id,
          date: rp.paid_date as string,
          propertyId: propertyOfUnit.get(tenancyUnit.get(rp.tenancy_id) || '') || '',
          place: placeOf(tenancyUnit.get(rp.tenancy_id) || ''),
          amount: Number(rp.actual_amount),
          method: (rp.payment_method as 'bank' | 'card' | null) || null,
        }))
      )

      const jobIds = jobsList.map((j) => j.id)
      const jobById = new Map(jobsList.map((j) => [j.id, j]))
      const bids = jobIds.length
        ? await fetchAllPagesOrEmpty<{ id: string; job_id: string; amount: number; paid_at: string | null; contractor_user_id: string }>((from, to) =>
            supabase.from('bids').select('id, job_id, amount, paid_at, contractor_user_id').in('job_id', jobIds).eq('payment_status', 'paid').not('paid_at', 'is', null).range(from, to)
          )
        : []

      const contractorIds = Array.from(new Set(bids.map((b) => b.contractor_user_id).filter(Boolean)))
      const { data: contractors } = contractorIds.length
        ? await supabase.rpc('get_users_by_ids', { user_ids_input: contractorIds })
        : { data: [] as any[] }
      const contractorName = new Map<string, string>((contractors || []).map((c: any) => [c.id, c.full_name || t('unknownLabel', lang)]))

      setJobRows(
        bids.map((b) => {
          const job = jobById.get(b.job_id)
          return {
            id: b.id,
            date: (b.paid_at as string).slice(0, 10),
            propertyId: job ? propertyOfUnit.get(job.unit_id) || '' : '',
            place: job ? placeOf(job.unit_id) : t('unitFallback', lang),
            category: job?.category || '',
            contractorName: contractorName.get(b.contractor_user_id) || t('unknownLabel', lang),
            amount: Number(b.amount),
          }
        })
      )

      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const range = preset === 'custom' ? { from: customFrom, to: customTo } : presetRange(preset)

  const filteredRent = useMemo(
    () => rentRows.filter((r) => r.date >= range.from && r.date <= range.to && (propertyFilter === 'all' || r.propertyId === propertyFilter)),
    [rentRows, range.from, range.to, propertyFilter]
  )
  const filteredJobs = useMemo(
    () => jobRows.filter((r) => r.date >= range.from && r.date <= range.to && (propertyFilter === 'all' || r.propertyId === propertyFilter)),
    [jobRows, range.from, range.to, propertyFilter]
  )

  const totalCollected = filteredRent.reduce((sum, r) => sum + r.amount, 0)
  const totalPaidOut = filteredJobs.reduce((sum, r) => sum + r.amount, 0)
  const net = totalCollected - totalPaidOut

  // An estimate, deliberately labeled as one — Stripe holds the real,
  // itemized invoice history, this project doesn't mirror it locally.
  // Months-in-range counts calendar months touched by the selected range,
  // capped so a multi-year "All time" view doesn't imply a wildly precise
  // total from a tier that may have changed over that span.
  const monthsInRange = useMemo(() => {
    const from = new Date(range.from + 'T00:00:00')
    const to = new Date(range.to + 'T00:00:00')
    const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1
    return Math.max(1, Math.min(months, 36))
  }, [range.from, range.to])
  const estimatedSubscriptionCost = unitCount > 1 ? graduatedMonthlyAmount(unitCount) * monthsInRange : 0

  const rangeLabel = `${new Date(range.from + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(range.to + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`

  const exportRent = () => {
    downloadCsv(
      `prophandld-rent-collected-${range.from}-to-${range.to}.csv`,
      [t('dateHeader', lang), t('propertyLabel', lang), t('amountHeader', lang), t('methodLabelReceipt', lang)],
      filteredRent.map((r) => [r.date, r.place, r.amount.toFixed(2), r.method === 'bank' ? t('bankTransferValue', lang) : t('debitCardValue', lang)]),
      { heading: `Prophandld — ${t('rentCollectedLabel', lang)}`, subheading: `${landlordName || ''} · ${rangeLabel}` }
    )
  }
  const exportJobs = () => {
    downloadCsv(
      `prophandld-contractor-payments-${range.from}-to-${range.to}.csv`,
      [t('dateHeader', lang), t('propertyLabel', lang), t('categoryHeader', lang), t('contractorHeader', lang), t('amountHeader', lang)],
      filteredJobs.map((r) => [r.date, r.place, r.category, r.contractorName, r.amount.toFixed(2)]),
      { heading: `Prophandld — ${t('paidToContractorsLabel', lang)}`, subheading: `${landlordName || ''} · ${rangeLabel}` }
    )
  }
  const propertyLabel = propertyFilter === 'all' ? t('allPropertiesLabel', lang) : properties.find((p) => p.id === propertyFilter)?.address || ''

  return (
    <div className="min-h-screen bg-[#0C1A2E] print:bg-white">
      <style>{`
        @media print {
          nav, .no-print { display: none !important; }
          body { background: white !important; }
          .print-statement { display: block !important; }
        }
      `}</style>

      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between no-print">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">
          {t('backToDashboardArrowPlain', lang)}
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-10 pb-28 no-print">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">{t('reportsHeading', lang)}</h1>
          <p className="text-white/50 text-sm mt-1">{t('reportsSubtitle', lang)}</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-40" />
          </div>
        ) : properties.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">{t('noPropertiesYetReports', lang)}</p>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6">
              <div className="flex flex-wrap gap-2 mb-4">
                {(['thisYear', 'lastYear', 'allTime', 'custom'] as Preset[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPreset(p)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                      preset === p ? 'bg-[#12A5A9]/20 border-[#12A5A9] text-[#12A5A9]' : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20'
                    }`}
                  >
                    {t(p === 'thisYear' ? 'thisYearPreset' : p === 'lastYear' ? 'lastYearPreset' : p === 'allTime' ? 'allTimePreset' : 'customPreset', lang)}
                  </button>
                ))}
              </div>

              {preset === 'custom' && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-white/50 text-xs block mb-1">{t('fromLabel', lang)}</label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                    />
                  </div>
                  <div>
                    <label className="text-white/50 text-xs block mb-1">{t('toLabel', lang)}</label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                    />
                  </div>
                </div>
              )}

              <label className="text-white/50 text-xs block mb-1">{t('propertyFilterLabel', lang)}</label>
              <select
                value={propertyFilter}
                onChange={(e) => setPropertyFilter(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
              >
                <option value="all" className="bg-[#0C1A2E]">{t('allPropertiesLabel', lang)}</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#0C1A2E]">{p.address}</option>
                ))}
              </select>
            </div>

            {/* Summary */}
            <ScrollReveal>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSignIcon className="w-3.5 h-3.5 text-[#12A5A9]" />
                    <p className="text-white/50 text-[11px]">{t('rentCollectedLabel', lang)}</p>
                  </div>
                  <CountUp value={totalCollected} format={(n) => `$${n.toFixed(2)}`} className="text-white text-lg font-bold" />
                </div>
                <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSignIcon className="w-3.5 h-3.5 text-white/50" />
                    <p className="text-white/50 text-[11px]">{t('paidToContractorsLabel', lang)}</p>
                  </div>
                  <CountUp value={totalPaidOut} format={(n) => `$${n.toFixed(2)}`} className="text-white text-lg font-bold" />
                </div>
                <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSignIcon className="w-3.5 h-3.5 text-white/50" />
                    <p className="text-white/50 text-[11px]">{t('netLabel', lang)}</p>
                  </div>
                  <CountUp value={net} format={(n) => `$${n.toFixed(2)}`} className="text-white text-lg font-bold" />
                </div>
              </div>
            </ScrollReveal>

            {estimatedSubscriptionCost > 0 && (
              <p className="text-white/40 text-xs mb-8">
                {t('estimatedSubscriptionNote', lang)} <span className="text-white/60 font-medium">${estimatedSubscriptionCost.toFixed(2)}</span> {t('estimatedSubscriptionNoteSuffix', lang)}
              </p>
            )}
            {estimatedSubscriptionCost === 0 && <div className="mb-8" />}

            <div className="flex items-center justify-end gap-2 mb-6">
              <RippleButton
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-white/70 text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-white/8 transition"
              >
                <PrinterIcon className="w-3.5 h-3.5" /> {t('printSaveAsPdfBtn', lang)}
              </RippleButton>
            </div>

            {/* Rent collected */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold text-sm">{t('rentCollectedLabel', lang)} ({filteredRent.length})</h2>
                {filteredRent.length > 0 && (
                  <button onClick={exportRent} className="inline-flex items-center gap-1 text-[#12A5A9] text-xs font-semibold hover:underline">
                    <DownloadIcon className="w-3.5 h-3.5" /> {t('exportCsvBtn', lang)}
                  </button>
                )}
              </div>
              {filteredRent.length === 0 ? (
                <div className="bg-white/3 border border-white/8 rounded-2xl p-6 text-center">
                  <p className="text-white/40 text-sm">{t('noTransactionsInRange', lang)}</p>
                </div>
              ) : (
                <div className="bg-white/3 border border-white/8 rounded-2xl divide-y divide-white/5 max-h-96 overflow-y-auto">
                  {filteredRent.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm truncate">{r.place}</p>
                        <p className="text-white/40 text-xs mt-0.5">
                          {new Date(r.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {r.method === 'bank' ? t('bankTransferValue', lang) : t('debitCardValue', lang)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-white font-semibold text-sm mb-0.5">${r.amount.toFixed(2)}</p>
                        <Link href={`/receipts/rent/${r.id}`} className="inline-flex items-center gap-1 text-[#12A5A9] text-xs hover:underline">
                          <ReceiptIcon className="w-3 h-3" /> {t('receipt', lang)}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Job payments made */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold text-sm">{t('paidToContractorsLabel', lang)} ({filteredJobs.length})</h2>
                {filteredJobs.length > 0 && (
                  <button onClick={exportJobs} className="inline-flex items-center gap-1 text-[#12A5A9] text-xs font-semibold hover:underline">
                    <DownloadIcon className="w-3.5 h-3.5" /> {t('exportCsvBtn', lang)}
                  </button>
                )}
              </div>
              {filteredJobs.length === 0 ? (
                <div className="bg-white/3 border border-white/8 rounded-2xl p-6 text-center">
                  <p className="text-white/40 text-sm">{t('noTransactionsInRange', lang)}</p>
                </div>
              ) : (
                <div className="bg-white/3 border border-white/8 rounded-2xl divide-y divide-white/5 max-h-96 overflow-y-auto">
                  {filteredJobs.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm truncate">{r.category} · {r.place}</p>
                        <p className="text-white/40 text-xs mt-0.5">
                          {new Date(r.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {r.contractorName}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-white font-semibold text-sm mb-0.5">${r.amount.toFixed(2)}</p>
                        <Link href={`/receipts/job/${r.id}`} className="inline-flex items-center gap-1 text-[#12A5A9] text-xs hover:underline">
                          <ReceiptIcon className="w-3 h-3" /> {t('receipt', lang)}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Printable statement — hidden on screen, shown only by @media print above */}
      <div className="print-statement hidden bg-white text-[#171717] max-w-2xl mx-auto px-10 py-10">
        <div className="h-1.5 -mx-10 -mt-10 mb-8" style={{ background: 'linear-gradient(90deg, #0A7B7E, #12A5A9)' }} />
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0A7B7E, #12A5A9)' }}>
              <Logo className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight block leading-tight">Prophandld</span>
              <span className="text-black/35 text-[10px] leading-tight">Your Property. Handled.</span>
            </div>
          </div>
          <span className="text-xs text-black/40">{new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
        <p className="font-mono text-[10px] tracking-[0.15em] text-black/40 uppercase mb-1">{t('reportsHeading', lang)}</p>
        <h1 className="text-xl font-semibold mb-0.5">{landlordName || t('unknownLabel', lang)}</h1>
        <p className="text-black/50 text-sm mb-1">{rangeLabel}</p>
        <p className="text-black/40 text-xs mb-6">{propertyLabel}</p>

        <div className="grid grid-cols-3 gap-4 mb-8 border-y border-black/10 py-4">
          <div>
            <p className="text-black/40 text-[10px] uppercase tracking-wide mb-1">{t('rentCollectedLabel', lang)}</p>
            <p className="font-mono font-semibold">${totalCollected.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-black/40 text-[10px] uppercase tracking-wide mb-1">{t('paidToContractorsLabel', lang)}</p>
            <p className="font-mono font-semibold">${totalPaidOut.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-black/40 text-[10px] uppercase tracking-wide mb-1">{t('netLabel', lang)}</p>
            <p className="font-mono font-semibold" style={{ color: '#0A7B7E' }}>${net.toFixed(2)}</p>
          </div>
        </div>

        <h2 className="text-sm font-semibold mb-2">{t('rentCollectedLabel', lang)}</h2>
        <table className="w-full text-xs font-mono mb-8" style={{ breakInside: 'avoid' }}>
          <thead>
            <tr className="border-b border-black/20 text-black/40">
              <th className="text-left font-normal py-1.5">{t('dateHeader', lang)}</th>
              <th className="text-left font-normal py-1.5">{t('propertyLabel', lang)}</th>
              <th className="text-left font-normal py-1.5">{t('methodLabelReceipt', lang)}</th>
              <th className="text-right font-normal py-1.5">{t('amountHeader', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRent.map((r) => (
              <tr key={r.id} className="border-b border-black/5">
                <td className="py-1.5">{r.date}</td>
                <td className="py-1.5">{r.place}</td>
                <td className="py-1.5">{r.method === 'bank' ? t('bankTransferValue', lang) : t('debitCardValue', lang)}</td>
                <td className="py-1.5 text-right">${r.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="text-sm font-semibold mb-2">{t('paidToContractorsLabel', lang)}</h2>
        <table className="w-full text-xs font-mono mb-8" style={{ breakInside: 'avoid' }}>
          <thead>
            <tr className="border-b border-black/20 text-black/40">
              <th className="text-left font-normal py-1.5">{t('dateHeader', lang)}</th>
              <th className="text-left font-normal py-1.5">{t('propertyLabel', lang)}</th>
              <th className="text-left font-normal py-1.5">{t('contractorHeader', lang)}</th>
              <th className="text-right font-normal py-1.5">{t('amountHeader', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.map((r) => (
              <tr key={r.id} className="border-b border-black/5">
                <td className="py-1.5">{r.date}</td>
                <td className="py-1.5">{r.place}</td>
                <td className="py-1.5">{r.contractorName}</td>
                <td className="py-1.5 text-right">${r.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {estimatedSubscriptionCost > 0 && (
          <p className="text-black/40 text-[11px] mb-6">{t('estimatedSubscriptionNote', lang)} ${estimatedSubscriptionCost.toFixed(2)} {t('estimatedSubscriptionNoteSuffix', lang)}</p>
        )}

        <div className="pt-4 border-t border-black/10 text-center">
          <p className="text-black/30 text-[10px]">{t('reportFooterNote', lang)}</p>
          <p className="text-black/25 text-[10px] mt-1">prophandld.com</p>
        </div>
      </div>
    </div>
  )
}
