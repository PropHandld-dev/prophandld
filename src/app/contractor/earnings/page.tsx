'use client'

import { useMemo, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Skeleton } from '@/components/Skeleton'
import { Logo } from '@/components/Logo'
import { RippleButton } from '@/components/RippleButton'
import { ReceiptIcon, DollarSignIcon, DownloadIcon, PrinterIcon } from '@/components/icons'
import { downloadCsv } from '@/lib/csvExport'
import { useLanguage, t } from '@/lib/i18n'

type Bid = {
  id: string
  amount: number
  payment_status: string | null
  paid_at: string | null
  created_at: string
  job_id: string
  jobs: {
    category: string
    status: string
    units?: { unit_number: string; properties?: { address: string; city: string } }
  } | null
}

type Preset = 'thisYear' | 'lastYear' | 'allTime' | 'custom'

function jobLocation(bid: Bid, lang: import('@/lib/i18n').Lang) {
  const address = bid.jobs?.units?.properties?.address
  const city = bid.jobs?.units?.properties?.city
  if (!address && !city) return t('addressNotSet', lang)
  return [address, city].filter(Boolean).join(', ')
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function presetRange(preset: Preset): { from: string; to: string } {
  const now = new Date()
  const year = now.getFullYear()
  if (preset === 'lastYear') return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
  if (preset === 'allTime') return { from: '2020-01-01', to: isoDate(now) }
  return { from: `${year}-01-01`, to: isoDate(now) }
}

export default function ContractorEarningsPage() {
  const router = useRouter()
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [bids, setBids] = useState<Bid[]>([])
  const [contractorName, setContractorName] = useState('')

  const [preset, setPreset] = useState<Preset>('allTime')
  const [customFrom, setCustomFrom] = useState(presetRange('thisYear').from)
  const [customTo, setCustomTo] = useState(presetRange('thisYear').to)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setContractorName((user.user_metadata as any)?.full_name || '')

      const { data, error } = await supabase
        .from('bids')
        .select('id, amount, payment_status, paid_at, created_at, job_id, jobs(category, status, units(unit_number, properties(address, city)))')
        .eq('contractor_user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading earnings:', error)
        setLoading(false)
        return
      }

      setBids(((data || []) as any[]).filter((b) => ['completed', 'archived'].includes(b.jobs?.status)))
      setLoading(false)
    }
    init()
  }, [router])

  const paidAll = bids.filter((b) => b.payment_status === 'paid')
  const unpaid = bids.filter((b) => b.payment_status !== 'paid')

  const range = preset === 'custom' ? { from: customFrom, to: customTo } : presetRange(preset)
  const paid = useMemo(
    () => paidAll.filter((b) => {
      const d = (b.paid_at || b.created_at).slice(0, 10)
      return d >= range.from && d <= range.to
    }),
    [paidAll, range.from, range.to]
  )

  const byYear = new Map<string, Bid[]>()
  for (const b of paid) {
    const year = new Date(b.paid_at || b.created_at).getFullYear().toString()
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push(b)
  }
  const years = Array.from(byYear.keys()).sort((a, b) => Number(b) - Number(a))

  const allTimeTotal = paidAll.reduce((sum, b) => sum + (b.amount || 0), 0)
  const thisYear = new Date().getFullYear().toString()
  const thisYearTotal = (byYear.get(thisYear) || []).reduce((sum, b) => sum + (b.amount || 0), 0)
  const rangeTotal = paid.reduce((sum, b) => sum + (b.amount || 0), 0)

  const rangeLabel = `${new Date(range.from + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(range.to + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`

  const exportCsv = () => {
    downloadCsv(
      `prophandld-earnings-${range.from}-to-${range.to}.csv`,
      [t('dateHeader', lang), t('categoryHeader', lang), t('propertyLabel', lang), t('amountHeader', lang)],
      paid.map((b) => [(b.paid_at || b.created_at).slice(0, 10), b.jobs?.category || '', jobLocation(b, lang), (b.amount || 0).toFixed(2)]),
      { heading: `Prophandld — ${t('pastJobsEarnings', lang)}`, subheading: `${contractorName || ''} · ${rangeLabel}` }
    )
  }

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
        <Link href="/contractor" className="text-white/50 hover:text-white text-sm transition">
          {t('homeBack', lang)}
        </Link>
        <Link href="/contractor" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-14" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-16 no-print">
        <h1 className="text-2xl font-bold text-white mb-1">{t('pastJobsEarnings', lang)}</h1>
        <p className="text-white/60 text-sm mb-8">{t('pastJobsEarningsDesc', lang)}</p>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1.5">
                  <DollarSignIcon className="w-4 h-4 text-[#12A5A9]" />
                  <span className="text-white/60 text-xs font-medium">{t('thisYear', lang)} ({thisYear})</span>
                </div>
                <p className="text-white text-2xl font-bold">${thisYearTotal.toFixed(2)}</p>
              </div>
              <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1.5">
                  <DollarSignIcon className="w-4 h-4 text-[#12A5A9]" />
                  <span className="text-white/60 text-xs font-medium">{t('allTime', lang)}</span>
                </div>
                <p className="text-white text-2xl font-bold">${allTimeTotal.toFixed(2)}</p>
              </div>
            </div>

            <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-8">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap gap-2">
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
                <div className="flex items-center gap-2">
                  <button onClick={exportCsv} className="inline-flex items-center gap-1 text-[#12A5A9] text-xs font-semibold hover:underline">
                    <DownloadIcon className="w-3.5 h-3.5" /> {t('exportCsvBtn', lang)}
                  </button>
                  <RippleButton
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-white/70 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-white/8 transition"
                  >
                    <PrinterIcon className="w-3.5 h-3.5" /> {t('printSaveAsPdfBtn', lang)}
                  </RippleButton>
                </div>
              </div>

              {preset === 'custom' && (
                <div className="grid grid-cols-2 gap-3 mb-1">
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
              <p className="text-white/40 text-xs mt-3">{rangeLabel} · <span className="text-white/60 font-medium">${rangeTotal.toFixed(2)}</span></p>
            </div>

            {years.length === 0 && unpaid.length === 0 && (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
                <p className="text-white/50 text-sm">{t('noCompletedJobsYet', lang)}</p>
              </div>
            )}

            {years.map((year) => (
              <div key={year} className="mb-6">
                <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wide mb-3">{year}</h2>
                <div className="bg-white/3 border border-white/8 rounded-2xl divide-y divide-white/5">
                  {byYear.get(year)!.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-3 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-medium text-sm truncate">{b.jobs?.category}</p>
                        <p className="text-white/60 text-xs truncate">{jobLocation(b, lang)}</p>
                        <p className="text-white/50 text-xs mt-0.5">
                          {t('paidOn', lang)} {new Date(b.paid_at || b.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-white font-semibold text-sm mb-1">${b.amount}</p>
                        <Link
                          href={`/receipts/job/${b.id}`}
                          className="inline-flex items-center gap-1 text-[#12A5A9] text-xs font-semibold hover:underline"
                        >
                          <ReceiptIcon className="w-3.5 h-3.5" />
                          {t('receipt', lang)}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {unpaid.length > 0 && (
              <div>
                <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wide mb-3">{t('awaitingPaymentHeading', lang)}</h2>
                <div className="bg-white/3 border border-white/8 rounded-2xl divide-y divide-white/5">
                  {unpaid.map((b) => (
                    <Link
                      key={b.id}
                      href={`/contractor/jobs/${b.job_id}`}
                      className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-white/5 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-medium text-sm truncate">{b.jobs?.category}</p>
                        <p className="text-white/60 text-xs truncate">{jobLocation(b, lang)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-white font-semibold text-sm">${b.amount}</p>
                        <p className="text-yellow-400/70 text-xs">{t('pendingStatus', lang)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Printable statement */}
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
        <p className="font-mono text-[10px] tracking-[0.15em] text-black/40 uppercase mb-1">{t('pastJobsEarnings', lang)}</p>
        <h1 className="text-xl font-semibold mb-0.5">{contractorName || t('unknownLabel', lang)}</h1>
        <p className="text-black/50 text-sm mb-6">{rangeLabel}</p>

        <div className="border-y border-black/10 py-4 mb-8">
          <p className="text-black/40 text-[10px] uppercase tracking-wide mb-1">{t('allTime', lang)}: {rangeLabel}</p>
          <p className="font-mono font-semibold text-lg" style={{ color: '#0A7B7E' }}>${rangeTotal.toFixed(2)}</p>
        </div>

        <table className="w-full text-xs font-mono mb-8">
          <thead>
            <tr className="border-b border-black/20 text-black/40">
              <th className="text-left font-normal py-1.5">{t('dateHeader', lang)}</th>
              <th className="text-left font-normal py-1.5">{t('categoryHeader', lang)}</th>
              <th className="text-left font-normal py-1.5">{t('propertyLabel', lang)}</th>
              <th className="text-right font-normal py-1.5">{t('amountHeader', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {paid.map((b) => (
              <tr key={b.id} className="border-b border-black/5">
                <td className="py-1.5">{(b.paid_at || b.created_at).slice(0, 10)}</td>
                <td className="py-1.5">{b.jobs?.category}</td>
                <td className="py-1.5">{jobLocation(b, lang)}</td>
                <td className="py-1.5 text-right">${(b.amount || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pt-4 border-t border-black/10 text-center">
          <p className="text-black/30 text-[10px]">{t('reportFooterNote', lang)}</p>
          <p className="text-black/25 text-[10px] mt-1">prophandld.com</p>
        </div>
      </div>
    </div>
  )
}
