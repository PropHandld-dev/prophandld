'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomTabBar } from '@/components/BottomTabBar'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { downloadCsv } from '@/lib/csvExport'
import { scanDocument } from '@/lib/aiFile'
import { useLanguage, t, type Lang } from '@/lib/i18n'
import { useConfirm } from '@/lib/useConfirm'
import { validateDocumentFile } from '@/lib/mediaValidation'

type Entry = {
  id: string
  type: 'rent' | 'contractor' | 'fee' | 'manual'
  direction: 'in' | 'out'
  date: string
  amount: number
  title: string
  detail: string | null
  counterparty: string | null
  method: string | null
  ownerId: string
  ownerName: string
  propertyId: string | null
  propertyLabel: string | null
  unitLabel: string | null
  receiptUrl: string | null
  photos: string[]
  jobId: string | null
  category: string | null
}
type Data = {
  year: number
  entries: Entry[]
  totals: { income: number; expenses: number; net: number }
  byProperty: { propertyId: string; label: string; income: number; expenses: number }[]
  owners: { id: string; name: string }[]
  properties: { id: string; label: string; ownerId: string }[]
}

const CATEGORY_LABELS: Record<string, string> = {
  rent: 'Rent (paid outside the app)',
  deposit: 'Security deposit received',
  other_income: 'Other income',
  repair: 'Repair or maintenance',
  utilities: 'Utilities',
  insurance: 'Insurance',
  tax: 'Property tax',
  mortgage: 'Mortgage interest',
  hoa: 'HOA dues',
  supplies: 'Supplies',
  management: 'Management fees',
  legal: 'Legal and professional',
  other: 'Other expense',
}
// English labels above stay as-is for the CSV exports (they go to an
// accountant and line up with IRS wording); the screen uses these keys.
type Key = Parameters<typeof t>[0]
const CATEGORY_KEYS: Record<string, Key> = {
  rent: 'recCatRent', deposit: 'recCatDeposit', other_income: 'recCatOtherIncome', repair: 'recCatRepair',
  utilities: 'recCatUtilities', insurance: 'recCatInsurance', tax: 'recCatTax', mortgage: 'recCatMortgage',
  hoa: 'recCatHoa', supplies: 'recCatSupplies', management: 'recCatManagement', legal: 'recCatLegal', other: 'recCatOther',
}
const categoryLabel = (c: string, lang: Lang) => (CATEGORY_KEYS[c] ? t(CATEGORY_KEYS[c], lang) : CATEGORY_LABELS[c] || c)
const TYPE_CHIP: Record<Entry['type'], { label: string; key: Key; cls: string }> = {
  rent: { label: 'Rent', key: 'recTypeRent', cls: 'bg-[#12A5A9]/15 text-[#12A5A9]' },
  contractor: { label: 'Contractor', key: 'recTypeContractor', cls: 'bg-violet-500/15 text-violet-300' },
  fee: { label: 'Mgmt fee', key: 'recTypeFee', cls: 'bg-amber-500/15 text-amber-300' },
  manual: { label: 'Added by hand', key: 'recTypeManual', cls: 'bg-white/8 text-white/60' },
}

// IRS Schedule E (Form 1040) line each entry rolls up to. Security
// deposits are left out: they're not income unless kept.
const SCHEDULE_E: { line: string; label: string; key: Key }[] = [
  { line: '3', label: 'Rents received', key: 'recLine3' },
  { line: '9', label: 'Insurance', key: 'recLine9' },
  { line: '10', label: 'Legal and other professional fees', key: 'recLine10' },
  { line: '11', label: 'Management fees', key: 'recLine11' },
  { line: '12', label: 'Mortgage interest', key: 'recLine12' },
  { line: '14', label: 'Repairs', key: 'recLine14' },
  { line: '15', label: 'Supplies', key: 'recLine15' },
  { line: '16', label: 'Taxes', key: 'recLine16' },
  { line: '17', label: 'Utilities', key: 'recLine17' },
  { line: '19', label: 'Other', key: 'recLine19' },
]
function scheduleELine(e: Entry): string | null {
  if (e.type === 'rent') return '3'
  if (e.type === 'contractor') return '14'
  if (e.type === 'fee') return '11'
  switch (e.category) {
    case 'rent': case 'other_income': return '3'
    case 'deposit': return null
    case 'insurance': return '9'
    case 'legal': return '10'
    case 'management': return '11'
    case 'mortgage': return '12'
    case 'repair': return '14'
    case 'supplies': return '15'
    case 'tax': return '16'
    case 'utilities': return '17'
    default: return '19'
  }
}

const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 === 0 ? 0 : 2 })

export default function RecordsPage() {
  const router = useRouter()
  const lang = useLanguage()
  const { confirm, ConfirmDialog } = useConfirm()
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [owner, setOwner] = useState('')
  const [property, setProperty] = useState('')
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const q = new URLSearchParams({ year: String(year) })
    if (owner) q.set('owner', owner)
    if (property) q.set('property', property)
    const res = await fetch(`/api/records?${q}`).catch(() => null)
    const d = res ? await res.json().catch(() => null) : null
    if (!res?.ok || !d) setError(d?.error || t('recLoadFailed', lang))
    else setData(d)
    setLoading(false)
  }, [year, owner, property, lang])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/login')
    })
    const params = new URLSearchParams(window.location.search)
    if (params.get('owner')) setOwner(params.get('owner')!)
  }, [router])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => (data?.entries || []).filter((e) => filter === 'all' || e.direction === filter), [data, filter])
  const byMonth = useMemo(() => {
    const groups = new Map<string, Entry[]>()
    for (const e of shown) {
      const key = e.date.slice(0, 7)
      groups.set(key, [...(groups.get(key) || []), e])
    }
    return Array.from(groups.entries())
  }, [shown])
  const maxProperty = Math.max(1, ...(data?.byProperty || []).map((p) => Math.max(p.income, p.expenses)))
  const taxLines = useMemo(() => {
    const totals = new Map<string, number>()
    for (const e of data?.entries || []) {
      const line = scheduleELine(e)
      if (!line) continue
      totals.set(line, (totals.get(line) || 0) + e.amount)
    }
    return SCHEDULE_E.map((l) => ({ ...l, amount: Math.round((totals.get(l.line) || 0) * 100) / 100 }))
  }, [data])
  const [showTax, setShowTax] = useState(false)
  const [insights, setInsights] = useState<{ summary: string; highlights: string[]; checks: string[] } | null>(null)
  const [insightsBusy, setInsightsBusy] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)
  const explainYear = async () => {
    if (!data) return
    setInsightsBusy(true)
    setInsightsError(null)
    const byMonth: Record<string, { in: number; out: number }> = {}
    for (const e of data.entries) {
      const k = e.date.slice(0, 7)
      byMonth[k] = byMonth[k] || { in: 0, out: 0 }
      byMonth[k][e.direction] += e.amount
    }
    const res = await fetch('/api/ai-assist/records-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: data.year,
        totals: data.totals,
        byProperty: data.byProperty.map((p) => ({ property: p.label, income: Math.round(p.income), expenses: Math.round(p.expenses) })),
        byLine: taxLines.map((l) => ({ line: l.label, amount: l.amount })),
        byMonth,
        manualEntriesWithoutReceipt: data.entries.filter((e) => e.type === 'manual' && e.direction === 'out' && !e.receiptUrl).length,
        depositsRecorded: data.entries.filter((e) => e.category === 'deposit').reduce((t, e) => t + e.amount, 0),
      }),
    }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setInsightsBusy(false)
    if (!res?.ok) setInsightsError(d.error || t('recExplainFailed', lang))
    else setInsights(d)
  }
  const exportTax = () => {
    if (!data) return
    const income = taxLines.filter((l) => l.line === '3').reduce((t, l) => t + l.amount, 0)
    const expenses = taxLines.filter((l) => l.line !== '3').reduce((t, l) => t + l.amount, 0)
    downloadCsv(
      `prophandld-schedule-e-${data.year}.csv`,
      ['Schedule E line', 'Description', 'Amount'],
      [...taxLines.map((l) => [l.line, l.label, l.amount.toFixed(2)]), ['', 'Total expenses', expenses.toFixed(2)], ['', 'Income minus expenses', (income - expenses).toFixed(2)]],
      { heading: `Rental income and expenses by Schedule E line, ${data.year}`, subheading: 'Prepared from Prophandld records. Not tax advice: review with your tax professional. Security deposits are excluded.' }
    )
  }
  const multiOwner = (data?.owners.length || 0) > 1

  const exportCsv = () => {
    if (!data) return
    downloadCsv(
      `prophandld-records-${data.year}.csv`,
      ['Date', 'Type', 'In/Out', 'Amount', 'Description', 'Details', 'Paid by / to', 'Method', 'Property', 'Unit', ...(multiOwner ? ['Owner'] : []), 'Category'],
      data.entries.map((e) => [
        e.date,
        TYPE_CHIP[e.type].label,
        e.direction === 'in' ? 'Income' : 'Expense',
        (e.direction === 'in' ? e.amount : -e.amount).toFixed(2),
        e.title,
        e.detail || '',
        e.counterparty || '',
        e.method || '',
        e.propertyLabel || '',
        e.unitLabel || '',
        ...(multiOwner ? [e.ownerName] : []),
        e.category ? CATEGORY_LABELS[e.category] || e.category : '',
      ]),
      { heading: `Income and expenses ${data.year}`, subheading: `Income ${money(data.totals.income)} · Expenses ${money(data.totals.expenses)} · Net ${money(data.totals.net)}` }
    )
  }

  const select = 'bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#12A5A9] min-w-0'

  return (
    <div className="min-h-screen bg-[#0C1A2E] pb-28">
      <nav className="border-b border-white/8 px-5 py-4 flex items-center justify-between print:hidden">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">{t('dashboard', lang)}</Link>
        <span className="text-white font-semibold text-sm">{t('recTitle', lang)}</span>
        <span className="w-20" />
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{t('recTitle', lang)}</h1>
            <p className="text-white/50 text-sm mt-1">{t('recIntro', lang)}</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button onClick={() => setAdding(true)} className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:opacity-90">{t('recAddEntry', lang)}</button>
            <button onClick={exportCsv} disabled={!data || data.entries.length === 0} className="bg-white/5 border border-white/10 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-white/8 disabled:opacity-40">{t('recExport', lang).replace('{year}', String(year))}</button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-6 print:hidden">
          <select aria-label={t('recYear', lang)} value={year} onChange={(e) => setYear(Number(e.target.value))} className={select}>
            {Array.from({ length: 6 }, (_, i) => thisYear - i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {multiOwner && (
            <select aria-label={t('recClient', lang)} value={owner} onChange={(e) => { setOwner(e.target.value); setProperty('') }} className={select}>
              <option value="">{t('recAllClients', lang)}</option>
              {data!.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          {(data?.properties.length || 0) > 1 && (
            <select aria-label={t('recProperty', lang)} value={property} onChange={(e) => setProperty(e.target.value)} className={`${select} max-w-[220px]`}>
              <option value="">{t('recAllProperties', lang)}</option>
              {data!.properties.filter((p) => !owner || p.ownerId === owner).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          )}
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">{error}</div>}

        {loading && !data ? (
          <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />)}</div>
        ) : data && (
          <>
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mb-6">
              {[
                { label: t('recIncome', lang), value: data.totals.income, tone: 'text-[#12A5A9]', f: 'in' as const },
                { label: t('recExpenses', lang), value: data.totals.expenses, tone: 'text-white', f: 'out' as const },
                { label: t('recNet', lang), value: data.totals.net, tone: data.totals.net >= 0 ? 'text-white' : 'text-red-400', f: 'all' as const },
              ].map((c) => (
                <button key={c.label} onClick={() => setFilter(c.f)} className={`min-w-0 text-left rounded-2xl border p-3 sm:p-5 transition ${filter === c.f ? 'border-[#12A5A9]/50 bg-[#12A5A9]/8' : 'border-white/8 bg-white/3 hover:bg-white/5'}`}>
                  <p className="text-white/50 text-xs font-semibold uppercase tracking-wide">{c.label}</p>
                  <p className={`text-base sm:text-3xl font-bold tabular-nums mt-1.5 truncate ${c.tone}`}>
                    {c.value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: Math.abs(c.value) >= 1000 ? 0 : 2 })}
                  </p>
                </button>
              ))}
            </div>

            {data.byProperty.length > 1 && (
              <div className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-5 mb-6">
                <p className="text-white font-semibold text-sm mb-3">{t('recByProperty', lang)}</p>
                <ul className="space-y-3">
                  {data.byProperty.map((p) => (
                    <li key={p.propertyId}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-white/80 truncate">{p.label}</span>
                        <span className="text-white/50 tabular-nums shrink-0">{t('recNetSuffix', lang).replace('{amount}', money(p.income - p.expenses))}</span>
                      </div>
                      <div className="mt-1.5 space-y-1">
                        <div className="h-1.5 rounded-full bg-[#12A5A9]" style={{ width: `${(p.income / maxProperty) * 100}%` }} title={`${t('recIncome', lang)} ${money(p.income)}`} />
                        <div className="h-1.5 rounded-full bg-white/30" style={{ width: `${(p.expenses / maxProperty) * 100}%` }} title={`${t('recExpenses', lang)} ${money(p.expenses)}`} />
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-white/35 text-xs mt-3">{t('recBarsLegend', lang)}</p>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3 mb-6">
              <div className="rounded-2xl border border-[#12A5A9]/30 bg-gradient-to-br from-[#0A7B7E]/12 to-transparent p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-white font-semibold text-sm">{t('recExplainTitle', lang)}</p>
                  {!insights && (
                    <button onClick={explainYear} disabled={insightsBusy || data.entries.length === 0} className="text-[#12A5A9] text-sm font-semibold disabled:opacity-40">
                      {insightsBusy ? t('recReading', lang) : t('recGo', lang)}
                    </button>
                  )}
                </div>
                {!insights && !insightsError && <p className="text-white/50 text-xs mt-1">{t('recExplainHint', lang).replace('{year}', String(data.year))}</p>}
                {insightsError && <p className="text-red-400 text-xs mt-1">{insightsError}</p>}
                {insights && (
                  <div className="mt-2 space-y-2">
                    <p className="text-white/80 text-sm leading-relaxed">{insights.summary}</p>
                    {insights.highlights.length > 0 && <ul className="space-y-1">{insights.highlights.map((h, i) => <li key={i} className="text-white/65 text-xs">• {h}</li>)}</ul>}
                    {insights.checks.length > 0 && (
                      <div>
                        <p className="text-yellow-400 text-xs font-semibold">{t('recCheckBeforeFiling', lang)}</p>
                        <ul className="space-y-1 mt-1">{insights.checks.map((h, i) => <li key={i} className="text-white/65 text-xs">• {h}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => setShowTax((v) => !v)} className="text-white font-semibold text-sm text-left">{t('recTaxSummary', lang)} {showTax ? '▴' : '▾'}</button>
                  <button onClick={exportTax} disabled={data.entries.length === 0} className="text-[#12A5A9] text-sm font-semibold disabled:opacity-40">{t('recExportShort', lang)}</button>
                </div>
                {!showTax ? (
                  <p className="text-white/50 text-xs mt-1">{t('recTaxHint', lang)}</p>
                ) : (
                  <table className="w-full mt-3 text-sm">
                    <tbody>
                      {taxLines.map((l) => (
                        <tr key={l.line} className={l.amount === 0 ? 'text-white/35' : 'text-white/80'}>
                          <td className="py-1 pr-2 tabular-nums w-8">{l.line}</td>
                          <td className="py-1">{t(l.key, lang)}</td>
                          <td className="py-1 text-right tabular-nums">{money(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {showTax && <p className="text-white/35 text-[11px] mt-2">{t('recTaxNote', lang)}</p>}
              </div>
            </div>

            {shown.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-white/3 p-10 text-center">
                <p className="text-white font-semibold">{t('recEmptyTitle', lang).replace('{year}', String(year))}</p>
                <p className="text-white/50 text-sm mt-1">{t('recEmptyBody', lang)}</p>
              </div>
            ) : (
              <div className="space-y-6">
                {byMonth.map(([month, list]) => {
                  const inSum = list.filter((e) => e.direction === 'in').reduce((t, e) => t + e.amount, 0)
                  const outSum = list.filter((e) => e.direction === 'out').reduce((t, e) => t + e.amount, 0)
                  return (
                    <section key={month}>
                      <div className="flex items-baseline justify-between gap-3 mb-2 px-1">
                        <h2 className="text-white font-semibold">{new Date(month + '-01T00:00:00').toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { month: 'long', year: 'numeric' })}</h2>
                        <p className="text-white/45 text-xs tabular-nums">+{money(inSum)} · −{money(outSum)}</p>
                      </div>
                      <ul className="rounded-2xl border border-white/8 bg-white/3 divide-y divide-white/6 overflow-hidden">
                        {list.map((e) => {
                          const open = expanded === e.id
                          const expandable = e.type === 'contractor' || !!e.detail || e.photos.length > 0
                          return (
                            <li key={e.id}>
                              <button
                                type="button"
                                onClick={() => expandable && setExpanded(open ? null : e.id)}
                                className={`w-full text-left px-4 py-3.5 flex items-center gap-3 ${expandable ? 'hover:bg-white/3' : 'cursor-default'}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${TYPE_CHIP[e.type].cls}`}>{t(TYPE_CHIP[e.type].key, lang)}</span>
                                    <span className="text-white text-sm font-medium truncate">{e.type === 'manual' && e.category ? categoryLabel(e.category, lang) : e.title}</span>
                                  </div>
                                  <p className="text-white/45 text-xs mt-1 truncate">
                                    {new Date(e.date + 'T00:00:00').toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' })}
                                    {e.counterparty ? ` · ${e.counterparty}` : ''}
                                    {e.propertyLabel ? ` · ${e.propertyLabel}${e.unitLabel ? `, ${e.unitLabel}` : ''}` : ''}
                                    {multiOwner && !owner ? ` · ${e.ownerName}` : ''}
                                  </p>
                                </div>
                                <span className={`text-sm font-semibold tabular-nums shrink-0 ${e.direction === 'in' ? 'text-[#12A5A9]' : 'text-white'}`}>
                                  {e.direction === 'in' ? '+' : '−'}{money(e.amount)}
                                </span>
                              </button>
                              {open && (
                                <div className="px-4 pb-4 -mt-1 space-y-3">
                                  {e.detail && <p className="text-white/70 text-sm leading-relaxed">{e.type === 'contractor' ? t('recWorkPrefix', lang) : ''}{e.detail}</p>}
                                  {e.photos.length > 0 && (
                                    <div className="flex gap-2 overflow-x-auto">
                                      {e.photos.map((src, i) => (
                                        <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={src} alt={t('recJobPhoto', lang).replace('{n}', String(i + 1))} className="w-24 h-24 rounded-xl object-cover border border-white/10" />
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-4 flex-wrap text-xs">
                                    {e.method && <span className="text-white/45">{e.method}</span>}
                                    {e.receiptUrl && <a href={e.receiptUrl} target={e.receiptUrl.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer" className="text-[#12A5A9] font-semibold hover:underline">{t('recReceiptLink', lang)}</a>}
                                    {e.jobId && <Link href={`/landlord/jobs/${e.jobId}`} className="text-[#12A5A9] font-semibold hover:underline">{t('recOpenJob', lang)}</Link>}
                                    {e.type === 'manual' && (
                                      <button
                                        onClick={async () => {
                                          if (!(await confirm({ body: t('recDeleteConfirm', lang), confirmLabel: t('delete', lang), danger: true }))) return
                                          await fetch(`/api/records/entries/${e.id.replace('manual-', '')}`, { method: 'DELETE' })
                                          load()
                                        }}
                                        className="text-red-400/70 hover:text-red-400 ml-auto"
                                      >
                                        {t('delete', lang)}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>

      {adding && data && (
        <AddEntrySheet
          lang={lang}
          properties={data.properties.filter((p) => !owner || p.ownerId === owner)}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); load() }}
        />
      )}
      {ConfirmDialog}
      <div className="print:hidden"><BottomTabBar tabs={LANDLORD_TABS} /></div>
    </div>
  )
}

function AddEntrySheet({ lang, properties, onClose, onSaved }: { lang: Lang; properties: { id: string; label: string }[]; onClose: () => void; onSaved: () => void }) {
  const [direction, setDirection] = useState<'out' | 'in'>('out')
  const [category, setCategory] = useState('repair')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [propertyId, setPropertyId] = useState(properties.length === 1 ? properties[0].id : '')
  const [description, setDescription] = useState('')
  const [vendor, setVendor] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanNote, setScanNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pickReceipt = async (f: File | null) => {
    if (!f) return setFile(null)
    const problem = await validateDocumentFile(f, { allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'] })
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setFile(f)
  }
  const scan = async (f: File) => {
    const problem = await validateDocumentFile(f, { allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'] })
    if (problem) {
      setError(problem)
      return
    }
    setFile(f)
    setScanning(true)
    setScanNote(null)
    setError(null)
    const r = await scanDocument(f, 'receipt')
    setScanning(false)
    if ('error' in r) {
      setScanNote(r.error)
      return
    }
    if (r.direction) setDirection(r.direction)
    if (r.category) setCategory(r.category)
    if (r.amount) setAmount(String(r.amount))
    if (r.date) setDate(r.date)
    if (r.vendor) setVendor(r.vendor)
    if (r.description) setDescription(r.description)
    setScanNote(t('recScanFilled', lang))
  }
  const cats = direction === 'in' ? ['rent', 'deposit', 'other_income'] : ['repair', 'utilities', 'insurance', 'tax', 'mortgage', 'hoa', 'supplies', 'management', 'legal', 'other']
  const input = 'w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-white/35 focus:outline-none focus:border-[#12A5A9]'

  const save = async () => {
    setSaving(true)
    setError(null)
    const ext = file ? (file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ? 'pdf' : file.type === 'image/png' || /\.png$/i.test(file.name) ? 'png' : 'jpg') : null
    const res = await fetch('/api/records/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction, category, amount: Number(amount), date, propertyId: propertyId || null, description, vendor, receipt: ext }),
    }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) {
      setSaving(false)
      setError(d.error || t('recCouldNotSave', lang))
      return
    }
    if (file && d.upload) {
      const { error: upErr } = await supabase.storage.from('documents').uploadToSignedUrl(d.upload.path, d.upload.token, file, { contentType: file.type || undefined })
      const attached = !upErr && (await fetch(`/api/records/entries/${d.id}/attach`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: d.upload.path, filename: file.name }) }).catch(() => null))?.ok
      if (!attached) {
        // The entry itself is saved; say so instead of silently dropping the receipt.
        setSaving(false)
        setError(t('recReceiptUploadFailed', lang))
        setTimeout(onSaved, 2500)
        return
      }
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-[#0F2138] border border-white/10 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-6">
        <h3 className="text-white font-semibold text-lg">{t('recAddTitle', lang)}</h3>
        <p className="text-white/50 text-xs mt-1">{t('recAddHint', lang)}</p>
        <label className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#12A5A9]/40 bg-[#12A5A9]/8 py-3 text-[#12A5A9] text-sm font-semibold cursor-pointer hover:bg-[#12A5A9]/12">
          {scanning ? t('recScanning', lang) : t('recScan', lang)}
          <input type="file" accept="image/*,.pdf,application/pdf" className="hidden" disabled={scanning} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) scan(f) }} />
        </label>
        {scanNote && <p className="text-white/55 text-xs mt-2">{scanNote}</p>}
        <div className="grid grid-cols-2 gap-1 bg-white/4 rounded-xl p-1 mt-5">
          {(['out', 'in'] as const).map((d) => (
            <button key={d} type="button" onClick={() => { setDirection(d); setCategory(d === 'in' ? 'rent' : 'repair') }} className={`py-2 rounded-lg text-sm font-semibold ${direction === d ? 'bg-[#12A5A9] text-white' : 'text-white/60'}`}>
              {d === 'out' ? t('recMoneyOut', lang) : t('recMoneyIn', lang)}
            </button>
          ))}
        </div>
        <div className="space-y-3 mt-4">
          <select aria-label={t('recCategory', lang)} value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
            {cats.map((c) => <option key={c} value={c}>{categoryLabel(c, lang)}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
              <input aria-label={t('recAmount', lang)} type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} pl-7`} />
            </div>
            <input aria-label={t('recDate', lang)} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </div>
          {properties.length > 0 && (
            <select aria-label={t('recProperty', lang)} value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={input}>
              <option value="">{t('recNoProperty', lang)}</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          )}
          <input aria-label={t('recDescription', lang)} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder={t('recDescriptionPh', lang)} className={input} />
          <input aria-label={t('recPaidToFrom', lang)} value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={120} placeholder={direction === 'out' ? t('recPaidToPh', lang) : t('recReceivedFrom', lang)} className={input} />
          <label className="flex items-center gap-2 text-[#12A5A9] text-sm font-semibold cursor-pointer">
            <span>{file ? t('recReceiptFile', lang).replace('{name}', file.name) : t('recAttachReceipt', lang)}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ''; pickReceipt(f) }} />
          </label>
        </div>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        <div className="flex items-center gap-3 mt-6">
          <button onClick={save} disabled={saving || !(Number(amount) > 0) || !date} className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl disabled:opacity-40">{saving ? t('recSaving', lang) : t('save', lang)}</button>
          <button onClick={onClose} className="text-white/50 hover:text-white text-sm">{t('cancel', lang)}</button>
        </div>
      </div>
    </div>
  )
}
