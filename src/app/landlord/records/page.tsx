'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomTabBar } from '@/components/BottomTabBar'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { downloadCsv } from '@/lib/csvExport'

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
const TYPE_CHIP: Record<Entry['type'], { label: string; cls: string }> = {
  rent: { label: 'Rent', cls: 'bg-[#12A5A9]/15 text-[#12A5A9]' },
  contractor: { label: 'Contractor', cls: 'bg-violet-500/15 text-violet-300' },
  fee: { label: 'Mgmt fee', cls: 'bg-amber-500/15 text-amber-300' },
  manual: { label: 'Added by hand', cls: 'bg-white/8 text-white/60' },
}

const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 === 0 ? 0 : 2 })

export default function RecordsPage() {
  const router = useRouter()
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
    if (!res?.ok || !d) setError(d?.error || 'Could not load your records.')
    else setData(d)
    setLoading(false)
  }, [year, owner, property])

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
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">← Dashboard</Link>
        <span className="text-white font-semibold text-sm">Records</span>
        <span className="w-20" />
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Records</h1>
            <p className="text-white/50 text-sm mt-1">Every dollar in and out: rent, contractor work, fees and anything you add.</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button onClick={() => setAdding(true)} className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:opacity-90">+ Add entry</button>
            <button onClick={exportCsv} disabled={!data || data.entries.length === 0} className="bg-white/5 border border-white/10 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-white/8 disabled:opacity-40">Export {year}</button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-6 print:hidden">
          <select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} className={select}>
            {Array.from({ length: 6 }, (_, i) => thisYear - i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {multiOwner && (
            <select aria-label="Client" value={owner} onChange={(e) => { setOwner(e.target.value); setProperty('') }} className={select}>
              <option value="">All clients</option>
              {data!.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          {(data?.properties.length || 0) > 1 && (
            <select aria-label="Property" value={property} onChange={(e) => setProperty(e.target.value)} className={`${select} max-w-[220px]`}>
              <option value="">All properties</option>
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
                { label: 'Income', value: data.totals.income, tone: 'text-[#12A5A9]', f: 'in' as const },
                { label: 'Expenses', value: data.totals.expenses, tone: 'text-white', f: 'out' as const },
                { label: 'Net', value: data.totals.net, tone: data.totals.net >= 0 ? 'text-white' : 'text-red-400', f: 'all' as const },
              ].map((c) => (
                <button key={c.label} onClick={() => setFilter(c.f)} className={`text-left rounded-2xl border p-3.5 sm:p-5 transition ${filter === c.f ? 'border-[#12A5A9]/50 bg-[#12A5A9]/8' : 'border-white/8 bg-white/3 hover:bg-white/5'}`}>
                  <p className="text-white/50 text-xs font-semibold uppercase tracking-wide">{c.label}</p>
                  <p className={`text-lg sm:text-3xl font-bold tabular-nums mt-1.5 ${c.tone}`}>{money(c.value)}</p>
                </button>
              ))}
            </div>

            {data.byProperty.length > 1 && (
              <div className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-5 mb-6">
                <p className="text-white font-semibold text-sm mb-3">By property</p>
                <ul className="space-y-3">
                  {data.byProperty.map((p) => (
                    <li key={p.propertyId}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-white/80 truncate">{p.label}</span>
                        <span className="text-white/50 tabular-nums shrink-0">{money(p.income - p.expenses)} net</span>
                      </div>
                      <div className="mt-1.5 space-y-1">
                        <div className="h-1.5 rounded-full bg-[#12A5A9]" style={{ width: `${(p.income / maxProperty) * 100}%` }} title={`Income ${money(p.income)}`} />
                        <div className="h-1.5 rounded-full bg-white/30" style={{ width: `${(p.expenses / maxProperty) * 100}%` }} title={`Expenses ${money(p.expenses)}`} />
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="text-white/35 text-xs mt-3">Teal is income, grey is expenses.</p>
              </div>
            )}

            {shown.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-white/3 p-10 text-center">
                <p className="text-white font-semibold">Nothing recorded for {year} yet</p>
                <p className="text-white/50 text-sm mt-1">Rent and paid contractor jobs show up here automatically. Add anything else by hand.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {byMonth.map(([month, list]) => {
                  const inSum = list.filter((e) => e.direction === 'in').reduce((t, e) => t + e.amount, 0)
                  const outSum = list.filter((e) => e.direction === 'out').reduce((t, e) => t + e.amount, 0)
                  return (
                    <section key={month}>
                      <div className="flex items-baseline justify-between gap-3 mb-2 px-1">
                        <h2 className="text-white font-semibold">{new Date(month + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
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
                                    <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${TYPE_CHIP[e.type].cls}`}>{TYPE_CHIP[e.type].label}</span>
                                    <span className="text-white text-sm font-medium truncate">{e.type === 'manual' && e.category ? CATEGORY_LABELS[e.category] || e.title : e.title}</span>
                                  </div>
                                  <p className="text-white/45 text-xs mt-1 truncate">
                                    {new Date(e.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
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
                                  {e.detail && <p className="text-white/70 text-sm leading-relaxed">{e.type === 'contractor' ? 'Work: ' : ''}{e.detail}</p>}
                                  {e.photos.length > 0 && (
                                    <div className="flex gap-2 overflow-x-auto">
                                      {e.photos.map((src, i) => (
                                        <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={src} alt={`Job photo ${i + 1}`} className="w-24 h-24 rounded-xl object-cover border border-white/10" />
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-4 flex-wrap text-xs">
                                    {e.method && <span className="text-white/45">{e.method}</span>}
                                    {e.receiptUrl && <a href={e.receiptUrl} target={e.receiptUrl.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer" className="text-[#12A5A9] font-semibold hover:underline">Receipt →</a>}
                                    {e.jobId && <Link href={`/landlord/jobs/${e.jobId}`} className="text-[#12A5A9] font-semibold hover:underline">Open job →</Link>}
                                    {e.type === 'manual' && (
                                      <button
                                        onClick={async () => {
                                          if (!window.confirm('Delete this entry?')) return
                                          await fetch(`/api/records/entries/${e.id.replace('manual-', '')}`, { method: 'DELETE' })
                                          load()
                                        }}
                                        className="text-red-400/70 hover:text-red-400 ml-auto"
                                      >
                                        Delete
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
          properties={data.properties.filter((p) => !owner || p.ownerId === owner)}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); load() }}
        />
      )}
      <div className="print:hidden"><BottomTabBar tabs={LANDLORD_TABS} /></div>
    </div>
  )
}

function AddEntrySheet({ properties, onClose, onSaved }: { properties: { id: string; label: string }[]; onClose: () => void; onSaved: () => void }) {
  const [direction, setDirection] = useState<'out' | 'in'>('out')
  const [category, setCategory] = useState('repair')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [propertyId, setPropertyId] = useState(properties.length === 1 ? properties[0].id : '')
  const [description, setDescription] = useState('')
  const [vendor, setVendor] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      setError(d.error || 'Could not save.')
      return
    }
    if (file && d.upload) {
      const { error: upErr } = await supabase.storage.from('documents').uploadToSignedUrl(d.upload.path, d.upload.token, file, { contentType: file.type || undefined })
      if (!upErr) {
        await fetch(`/api/records/entries/${d.id}/attach`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: d.upload.path, filename: file.name }) }).catch(() => null)
      }
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-[#0F2138] border border-white/10 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-6">
        <h3 className="text-white font-semibold text-lg">Add an entry</h3>
        <p className="text-white/50 text-xs mt-1">For anything not paid through Prophandld.</p>
        <div className="grid grid-cols-2 gap-1 bg-white/4 rounded-xl p-1 mt-5">
          {(['out', 'in'] as const).map((d) => (
            <button key={d} type="button" onClick={() => { setDirection(d); setCategory(d === 'in' ? 'rent' : 'repair') }} className={`py-2 rounded-lg text-sm font-semibold ${direction === d ? 'bg-[#12A5A9] text-white' : 'text-white/60'}`}>
              {d === 'out' ? 'Money out' : 'Money in'}
            </button>
          ))}
        </div>
        <div className="space-y-3 mt-4">
          <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
            {cats.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
              <input aria-label="Amount" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} pl-7`} />
            </div>
            <input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </div>
          {properties.length > 0 && (
            <select aria-label="Property" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={input}>
              <option value="">Not tied to one property</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          )}
          <input aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="What was it? (e.g. Replaced kitchen faucet)" className={input} />
          <input aria-label="Paid to or from" value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={120} placeholder={direction === 'out' ? 'Paid to (e.g. ABC Plumbing)' : 'Received from'} className={input} />
          <label className="flex items-center gap-2 text-[#12A5A9] text-sm font-semibold cursor-pointer">
            <span>{file ? `Receipt: ${file.name}` : '+ Attach receipt (photo or PDF)'}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
        </div>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        <div className="flex items-center gap-3 mt-6">
          <button onClick={save} disabled={saving || !(Number(amount) > 0) || !date} className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={onClose} className="text-white/50 hover:text-white text-sm">Cancel</button>
        </div>
      </div>
    </div>
  )
}
