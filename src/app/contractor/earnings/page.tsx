'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Skeleton } from '@/components/Skeleton'
import { ReceiptIcon, DollarSignIcon } from '@/components/icons'
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

function jobLocation(bid: Bid, lang: import('@/lib/i18n').Lang) {
  const address = bid.jobs?.units?.properties?.address
  const city = bid.jobs?.units?.properties?.city
  if (!address && !city) return t('addressNotSet', lang)
  return [address, city].filter(Boolean).join(', ')
}

export default function ContractorEarningsPage() {
  const router = useRouter()
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [bids, setBids] = useState<Bid[]>([])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

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

  const paid = bids.filter((b) => b.payment_status === 'paid')
  const unpaid = bids.filter((b) => b.payment_status !== 'paid')

  const byYear = new Map<string, Bid[]>()
  for (const b of paid) {
    const year = new Date(b.paid_at || b.created_at).getFullYear().toString()
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push(b)
  }
  const years = Array.from(byYear.keys()).sort((a, b) => Number(b) - Number(a))

  const allTimeTotal = paid.reduce((sum, b) => sum + (b.amount || 0), 0)
  const thisYear = new Date().getFullYear().toString()
  const thisYearTotal = (byYear.get(thisYear) || []).reduce((sum, b) => sum + (b.amount || 0), 0)

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/contractor" className="text-white/50 hover:text-white text-sm transition">
          {t('homeBack', lang)}
        </Link>
        <Link href="/contractor" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-14" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-16">
        <h1 className="text-2xl font-bold text-white mb-1">{t('pastJobsEarnings', lang)}</h1>
        <p className="text-white/60 text-sm mb-8">{t('pastJobsEarningsDesc', lang)}</p>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-8">
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
    </div>
  )
}
