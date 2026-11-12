'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { DownloadIcon } from '@/components/icons'
import { downloadCsv } from '@/lib/csvExport'

type Line = { date: string; place: string; method?: string | null; category?: string; amount: number }
type Statement = {
  ownerName: string
  month: string
  income: Line[]
  expenses: Line[]
  totalIncome: number
  totalExpenses: number
  net: number
}

function monthLabel(month: string) {
  return new Date(month + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function ClientStatementPage({ params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = use(params)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [data, setData] = useState<Statement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/pm/clients/${portfolioId}/statement?month=${month}`)
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Could not load statement')
        setData(json)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load statement'))
      .finally(() => setLoading(false))
  }, [portfolioId, month])

  const handleExport = () => {
    if (!data) return
    const rows: (string | number)[][] = [
      ...data.income.map((r) => ['Income', r.date, r.place, r.method || '', r.amount.toFixed(2)]),
      ...data.expenses.map((r) => ['Expense', r.date, r.place, r.category || '', r.amount.toFixed(2)]),
    ]
    downloadCsv(
      `${data.ownerName.replace(/\s+/g, '-')}-statement-${month}.csv`,
      ['Type', 'Date', 'Property', 'Detail', 'Amount'],
      rows,
      { heading: `${data.ownerName} — ${monthLabel(month)}`, subheading: `Rent collected: $${data.totalIncome.toFixed(2)} · Maintenance paid: $${data.totalExpenses.toFixed(2)} · Net: $${data.net.toFixed(2)}` }
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0F1C] px-4 py-8 pb-24">
      <div className="max-w-2xl mx-auto">
        <Link href="/landlord/pm" className="text-white/40 text-sm hover:text-white/70 transition mb-4 inline-block">← Back to dashboard</Link>

        <div className="flex items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-white font-bold text-xl">{data?.ownerName || 'Client'} statement</h1>
            <p className="text-white/40 text-sm">{monthLabel(month)}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
            />
            <RippleButton
              onClick={handleExport}
              disabled={!data}
              className="bg-white/5 border border-white/10 text-white/70 text-sm font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
            >
              <DownloadIcon className="w-4 h-4" /> CSV
            </RippleButton>
          </div>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">{error}</div>}

        {loading ? (
          <div className="h-48 bg-white/5 rounded-2xl animate-pulse" />
        ) : data ? (
          <>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-white/4 border border-white/8 rounded-xl p-4 text-center">
                <p className="text-[#12A5A9] font-bold text-lg tabular-nums">${data.totalIncome.toFixed(2)}</p>
                <p className="text-white/40 text-xs mt-1">Rent collected</p>
              </div>
              <div className="bg-white/4 border border-white/8 rounded-xl p-4 text-center">
                <p className="text-white font-bold text-lg tabular-nums">${data.totalExpenses.toFixed(2)}</p>
                <p className="text-white/40 text-xs mt-1">Maintenance paid</p>
              </div>
              <div className="bg-white/4 border border-white/8 rounded-xl p-4 text-center">
                <p className={`font-bold text-lg tabular-nums ${data.net >= 0 ? 'text-[#12A5A9]' : 'text-red-400'}`}>${data.net.toFixed(2)}</p>
                <p className="text-white/40 text-xs mt-1">Net</p>
              </div>
            </div>

            <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-5">
              <h2 className="text-white font-semibold mb-3">Rent collected</h2>
              {data.income.length === 0 ? (
                <p className="text-white/40 text-sm">No rent recorded this month.</p>
              ) : (
                <div className="space-y-2">
                  {data.income.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-white/70">{r.place} <span className="text-white/30 text-xs">· {r.date}</span></span>
                      <span className="text-white tabular-nums">${r.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollReveal>

            <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-3">Maintenance paid</h2>
              {data.expenses.length === 0 ? (
                <p className="text-white/40 text-sm">No maintenance payments this month.</p>
              ) : (
                <div className="space-y-2">
                  {data.expenses.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-white/70">{r.place} <span className="text-white/30 text-xs">· {r.category} · {r.date}</span></span>
                      <span className="text-white tabular-nums">${r.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollReveal>
          </>
        ) : null}
      </div>
    </div>
  )
}
