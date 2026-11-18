'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { buildLeaseSections, type LeaseInputs, type LeaseClause, type LeaseFlag } from '@/lib/paLease'

type Result = { id: string; inputs: LeaseInputs; extraClauses: LeaseClause[]; flags: LeaseFlag[]; createdAt: string }

const UTILS: { key: keyof LeaseInputs['utilities']; label: string }[] = [
  { key: 'electric', label: 'Electric' },
  { key: 'gas', label: 'Gas' },
  { key: 'water', label: 'Water' },
  { key: 'sewer', label: 'Sewer' },
  { key: 'trash', label: 'Trash' },
  { key: 'internet', label: 'Internet' },
]

export default function LeaseBuilderPage() {
  const params = useParams()
  const propertyId = params.id as string
  const unitId = params.unitId as string
  const [inputs, setInputs] = useState<LeaseInputs | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [latest, setLatest] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/leases?unitId=${unitId}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'Could not load')
        setInputs(d.prefill)
        setLatest(d.latest)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [unitId])

  const set = <K extends keyof LeaseInputs>(k: K, v: LeaseInputs[K]) => setInputs((p) => (p ? { ...p, [k]: v } : p))

  const generate = async () => {
    if (!inputs) return
    setGenerating(true)
    setError(null)
    const res = await fetch('/api/leases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId, inputs }) }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setGenerating(false)
    if (!res?.ok) {
      setError(d.error || 'Could not create the lease.')
      return
    }
    setResult(d)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const input = 'w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-white/35 focus:outline-none focus:border-[#12A5A9]'
  const label = 'text-white/60 text-xs block mb-1'

  if (result) {
    const sections = buildLeaseSections(result.inputs, result.extraClauses)
    const warnings = result.flags.filter((f) => f.severity === 'warning')
    const infos = result.flags.filter((f) => f.severity === 'info')
    return (
      <div className="min-h-screen bg-[#0C1A2E] print:bg-white">
        <nav className="border-b border-white/8 px-5 py-4 flex items-center justify-between print:hidden">
          <button onClick={() => setResult(null)} className="text-white/50 hover:text-white text-sm">← Edit details</button>
          <span className="text-white font-semibold text-sm">Lease</span>
          <button onClick={() => window.print()} className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-xl">Print / Save PDF</button>
        </nav>
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 print:p-0 print:max-w-none">
          <div className="print:hidden space-y-3 mb-6">
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/8 p-4">
              <p className="text-yellow-400 font-semibold text-sm">Have a Pennsylvania attorney review this before anyone signs.</p>
              <p className="text-white/60 text-xs mt-1 leading-relaxed">This draft is built from a Pennsylvania template and your details. It is not legal advice, and local rules (especially in Philadelphia) change. Prophandld is not a law firm.</p>
            </div>
            {warnings.length > 0 && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/8 p-4">
                <p className="text-red-400 font-semibold text-sm mb-1.5">Fix before using</p>
                <ul className="space-y-1.5">{warnings.map((f, i) => <li key={i} className="text-white/75 text-sm">• {f.message}</li>)}</ul>
              </div>
            )}
            {infos.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                <p className="text-white font-semibold text-sm mb-1.5">Checklist for signing</p>
                <ul className="space-y-1.5">{infos.map((f, i) => <li key={i} className="text-white/65 text-sm">• {f.message}</li>)}</ul>
              </div>
            )}
          </div>

          <article className="lease-doc rounded-2xl bg-white text-[#14243A] p-6 sm:p-10 shadow-xl print:shadow-none print:rounded-none print:p-0">
            <h1 className="text-2xl font-bold text-center tracking-tight">Residential Lease</h1>
            <p className="text-center text-sm text-[#5b6b80] mt-1">Commonwealth of Pennsylvania</p>
            <div className="mt-8 space-y-6 text-[14.5px] leading-relaxed">
              {sections.map((s) => (
                <section key={s.title} className="break-inside-avoid">
                  <h2 className="font-bold text-[15px] mb-1.5">{s.title}</h2>
                  {s.paragraphs.map((p, i) => <p key={i} className="mb-2">{p}</p>)}
                </section>
              ))}
              <section className="break-inside-avoid pt-4">
                <h2 className="font-bold text-[15px] mb-4">Signatures</h2>
                <div className="grid sm:grid-cols-2 gap-8">
                  {[`Landlord: ${result.inputs.landlordName}${result.inputs.agentName ? ` (by ${result.inputs.agentName}, agent)` : ''}`, ...(result.inputs.tenantNames.length ? result.inputs.tenantNames.map((n) => `Tenant: ${n}`) : ['Tenant'])].map((who) => (
                    <div key={who}>
                      <div className="border-b border-[#14243A]/40 h-10" />
                      <p className="text-xs text-[#5b6b80] mt-1.5">{who}</p>
                      <p className="text-xs text-[#5b6b80] mt-3">Date: ______________</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </article>
          <p className="print:hidden text-white/35 text-xs mt-4 text-center">Draft saved {new Date(result.createdAt).toLocaleString()}. Once signed, upload the signed copy to this property&apos;s Documents.</p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E] pb-16">
      <nav className="border-b border-white/8 px-5 py-4 flex items-center justify-between">
        <Link href={`/landlord/properties/${propertyId}/units/${unitId}`} className="text-white/50 hover:text-white text-sm">← Unit</Link>
        <span className="text-white font-semibold text-sm">Create a lease</span>
        <span className="w-12" />
      </nav>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-[#12A5A9] text-xs font-semibold uppercase tracking-[0.18em]">Pennsylvania lease · AI assisted</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">Check the details, then create</h1>
        <p className="text-white/55 text-sm mt-1.5">We filled in what we already know. Anything you write in "Anything else" becomes clear lease terms.</p>

        {latest && (
          <button onClick={() => setResult(latest)} className="mt-4 w-full text-left rounded-2xl border border-white/10 bg-white/4 px-4 py-3 hover:bg-white/6">
            <p className="text-white text-sm font-semibold">Open your last draft</p>
            <p className="text-white/45 text-xs">Created {new Date(latest.createdAt).toLocaleDateString()}</p>
          </button>
        )}

        {loading && <div className="h-64 rounded-2xl bg-white/5 animate-pulse mt-6" />}
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mt-6">{error}</div>}

        {inputs && (
          <div className="space-y-5 mt-6">
            <fieldset className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-5 space-y-3">
              <legend className="px-1 text-white font-semibold text-sm">People</legend>
              <div>
                <label className={label} htmlFor="ll">Landlord (owner)</label>
                <input id="ll" value={inputs.landlordName} onChange={(e) => set('landlordName', e.target.value)} className={input} />
              </div>
              {inputs.agentName !== null && (
                <div>
                  <label className={label} htmlFor="agent">Managing agent</label>
                  <input id="agent" value={inputs.agentName || ''} onChange={(e) => set('agentName', e.target.value)} className={input} />
                </div>
              )}
              <div>
                <label className={label} htmlFor="tenants">Tenant names (one per line)</label>
                <textarea id="tenants" rows={2} value={inputs.tenantNames.join('\n')} onChange={(e) => set('tenantNames', e.target.value.split('\n'))} className={input} placeholder="Full legal name" />
              </div>
              <div>
                <label className={label} htmlFor="occ">Other occupants (optional)</label>
                <input id="occ" value={inputs.occupants} onChange={(e) => set('occupants', e.target.value)} className={input} placeholder="e.g. Maya (child)" />
              </div>
            </fieldset>

            <fieldset className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-5 space-y-3">
              <legend className="px-1 text-white font-semibold text-sm">Term and money</legend>
              <p className="text-white/45 text-xs">{inputs.address}{inputs.unitLabel ? `, ${inputs.unitLabel}` : ''}, {inputs.city}</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label} htmlFor="sd">Start date</label><input id="sd" type="date" value={inputs.startDate} onChange={(e) => set('startDate', e.target.value)} className={input} /></div>
                <div>
                  <label className={label} htmlFor="ed">End date</label>
                  <input id="ed" type="date" value={inputs.endDate || ''} disabled={!inputs.endDate} onChange={(e) => set('endDate', e.target.value)} className={`${input} disabled:opacity-40`} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-white/70 text-sm">
                <input type="checkbox" checked={!inputs.endDate} onChange={(e) => {
                  if (e.target.checked) set('endDate', null)
                  else { const d = new Date(inputs.startDate + 'T00:00:00'); d.setFullYear(d.getFullYear() + 1); d.setDate(d.getDate() - 1); set('endDate', d.toLocaleDateString('en-CA')) }
                }} className="accent-[#12A5A9]" />
                Month to month
              </label>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={label} htmlFor="rent">Rent / month</label><input id="rent" type="number" inputMode="decimal" value={inputs.rent || ''} onChange={(e) => set('rent', Number(e.target.value))} className={input} /></div>
                <div><label className={label} htmlFor="due">Due day</label><input id="due" type="number" min={1} max={28} value={inputs.dueDay} onChange={(e) => set('dueDay', Number(e.target.value))} className={input} /></div>
                <div><label className={label} htmlFor="dep">Deposit</label><input id="dep" type="number" inputMode="decimal" value={inputs.deposit || ''} onChange={(e) => set('deposit', Number(e.target.value))} className={input} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={label} htmlFor="lf">Late fee</label><input id="lf" type="number" inputMode="decimal" value={inputs.lateFee || ''} onChange={(e) => set('lateFee', Number(e.target.value))} className={input} placeholder="0" /></div>
                <div><label className={label} htmlFor="gr">Grace days</label><input id="gr" type="number" min={0} max={30} value={inputs.graceDays} onChange={(e) => set('graceDays', Number(e.target.value))} className={input} /></div>
                <div><label className={label} htmlFor="nv">Notice to leave</label><input id="nv" type="number" min={15} max={120} value={inputs.noticeToVacateDays} onChange={(e) => set('noticeToVacateDays', Number(e.target.value))} className={input} /></div>
              </div>
            </fieldset>

            <fieldset className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-5 space-y-4">
              <legend className="px-1 text-white font-semibold text-sm">Home rules</legend>
              <div>
                <p className={label}>Who pays utilities? Tap to switch.</p>
                <div className="grid grid-cols-3 gap-2">
                  {UTILS.map((u) => {
                    const v = inputs.utilities[u.key]
                    return (
                      <button key={u.key} type="button" onClick={() => set('utilities', { ...inputs.utilities, [u.key]: v === 'tenant' ? 'landlord' : 'tenant' })} className={`rounded-xl border px-2 py-2.5 text-left ${v === 'tenant' ? 'border-white/12 bg-white/4' : 'border-[#12A5A9]/40 bg-[#12A5A9]/10'}`}>
                        <span className="block text-white text-sm font-medium">{u.label}</span>
                        <span className="block text-white/50 text-[11px]">{v === 'tenant' ? 'Tenant pays' : 'Landlord pays'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 bg-white/4 rounded-xl p-1" role="radiogroup" aria-label="Pets">
                {([['none', 'No pets'], ['with_approval', 'With approval'], ['allowed', 'Pets OK']] as const).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={inputs.pets === k} onClick={() => set('pets', k)} className={`py-2 rounded-lg text-xs font-semibold ${inputs.pets === k ? 'bg-[#12A5A9] text-white' : 'text-white/60'}`}>{l}</button>
                ))}
              </div>
              {inputs.pets !== 'none' && (
                <div className="w-1/2"><label className={label} htmlFor="pd">Pet deposit (optional)</label><input id="pd" type="number" value={inputs.petDeposit || ''} onChange={(e) => set('petDeposit', Number(e.target.value))} className={input} placeholder="0" /></div>
              )}
              <label className="flex items-center gap-2 text-white/70 text-sm"><input type="checkbox" checked={inputs.smoking} onChange={(e) => set('smoking', e.target.checked)} className="accent-[#12A5A9]" /> Smoking allowed outside</label>
              <div><label className={label} htmlFor="pk">Parking (optional)</label><input id="pk" value={inputs.parking} onChange={(e) => set('parking', e.target.value)} className={input} placeholder="e.g. One off-street space" /></div>
              <div>
                <p className={label}>Was the home built before 1978?</p>
                <div className="grid grid-cols-3 gap-1 bg-white/4 rounded-xl p-1">
                  {([['yes', 'Yes'], ['no', 'No'], ['unknown', 'Not sure']] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => set('builtBefore1978', k)} className={`py-2 rounded-lg text-xs font-semibold ${inputs.builtBefore1978 === k ? 'bg-[#12A5A9] text-white' : 'text-white/60'}`}>{l}</button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-white/70 text-sm"><input type="checkbox" checked={inputs.inPhiladelphia} onChange={(e) => set('inPhiladelphia', e.target.checked)} className="accent-[#12A5A9]" /> Property is in Philadelphia</label>
            </fieldset>

            <fieldset className="rounded-2xl border border-[#12A5A9]/25 bg-[#12A5A9]/5 p-4 sm:p-5">
              <legend className="px-1 text-white font-semibold text-sm">✦ Anything else (AI writes it up)</legend>
              <textarea rows={4} maxLength={2000} value={inputs.extraNotes} onChange={(e) => set('extraNotes', e.target.value)} className={input} placeholder="In your own words, e.g. Quiet hours after 10pm. Tenant shovels the front steps. No grills on the balcony. Tenant needs renters insurance." />
              <p className="text-white/45 text-xs mt-2">AI turns these into clear clauses and flags anything that may not be allowed in Pennsylvania. Leave empty to skip.</p>
            </fieldset>

            <button onClick={generate} disabled={generating} className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3.5 rounded-2xl disabled:opacity-50">
              {generating ? (inputs.extraNotes ? 'Writing your lease…' : 'Creating…') : 'Create lease'}
            </button>
            <p className="text-white/35 text-xs text-center">A draft to review with a Pennsylvania attorney. Not legal advice.</p>
          </div>
        )}
      </main>
    </div>
  )
}
