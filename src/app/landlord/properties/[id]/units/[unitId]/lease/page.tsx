'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { buildLeaseSections, type LeaseInputs, type LeaseClause, type LeaseFlag } from '@/lib/paLease'
import { useLanguage, t } from '@/lib/i18n'
import { useConfirm } from '@/lib/useConfirm'

type Result = { id: string; inputs: LeaseInputs; extraClauses: LeaseClause[]; flags: LeaseFlag[]; createdAt: string }

const UTILS: { key: keyof LeaseInputs['utilities']; label: Parameters<typeof t>[0] }[] = [
  { key: 'electric', label: 'lsElectric' },
  { key: 'gas', label: 'lsGas' },
  { key: 'water', label: 'lsWater' },
  { key: 'sewer', label: 'lsSewer' },
  { key: 'trash', label: 'lsTrash' },
  { key: 'internet', label: 'lsInternet' },
]

export default function LeaseBuilderPage() {
  const params = useParams()
  const propertyId = params.id as string
  const unitId = params.unitId as string
  const lang = useLanguage()
  const { confirm, ConfirmDialog } = useConfirm()
  const locale = lang === 'es' ? 'es-US' : 'en-US'
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
        if (!r.ok) throw new Error(d.error || t('lsLoadFailed', lang))
        setInputs(d.prefill)
        setLatest(d.latest)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [unitId, lang])

  const set = <K extends keyof LeaseInputs>(k: K, v: LeaseInputs[K]) => setInputs((p) => (p ? { ...p, [k]: v } : p))

  const generate = async () => {
    if (!inputs) return
    setGenerating(true)
    setError(null)
    const res = await fetch('/api/leases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId, inputs }) }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setGenerating(false)
    if (!res?.ok) {
      setError(d.error || t('lsCreateFailed', lang))
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
          <button onClick={() => setResult(null)} className="text-white/50 hover:text-white text-sm">{t('lsEditDetails', lang)}</button>
          <span className="text-white font-semibold text-sm">{t('lsLease', lang)}</span>
          <button onClick={() => window.print()} className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-xl">{t('lsPrint', lang)}</button>
        </nav>
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 print:p-0 print:max-w-none">
          <div className="print:hidden space-y-3 mb-6">
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/8 p-4">
              <p className="text-yellow-400 font-semibold text-sm">{t('lsReviewTitle', lang)}</p>
              <p className="text-white/60 text-xs mt-1 leading-relaxed">{t('lsReviewBody', lang)}</p>
              {lang === 'es' && <p className="text-white/60 text-xs mt-1 leading-relaxed">{t('lsEnglishNote', lang)}</p>}
            </div>
            {warnings.length > 0 && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/8 p-4">
                <p className="text-red-400 font-semibold text-sm mb-1.5">{t('lsFixBefore', lang)}</p>
                <ul className="space-y-1.5">{warnings.map((f, i) => <li key={i} className="text-white/75 text-sm">• {f.message}</li>)}</ul>
              </div>
            )}
            {infos.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                <p className="text-white font-semibold text-sm mb-1.5">{t('lsChecklist', lang)}</p>
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
          <p className="print:hidden text-white/35 text-xs mt-4 text-center">
            {t('lsSavedNote', lang).replace('{when}', new Date(result.createdAt).toLocaleString(locale))}{' '}
            <button
              onClick={async () => {
                if (!(await confirm({ body: t('lsDeleteConfirm', lang), confirmLabel: t('delete', lang), danger: true }))) return
                await fetch(`/api/leases/${result.id}`, { method: 'DELETE' }).catch(() => null)
                setLatest(null)
                setResult(null)
              }}
              className="text-red-400/70 hover:text-red-400 font-semibold"
            >
              {t('lsDeleteDraft', lang)}
            </button>
          </p>
        </main>
        {ConfirmDialog}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E] pb-16">
      <nav className="border-b border-white/8 px-5 py-4 flex items-center justify-between">
        <Link href={`/landlord/properties/${propertyId}/units/${unitId}`} className="text-white/50 hover:text-white text-sm">{t('lsBackUnit', lang)}</Link>
        <span className="text-white font-semibold text-sm">{t('lsCreateTitle', lang)}</span>
        <span className="w-12" />
      </nav>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-[#12A5A9] text-xs font-semibold uppercase tracking-[0.18em]">{t('lsEyebrow', lang)}</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">{t('lsHeading', lang)}</h1>
        <p className="text-white/55 text-sm mt-1.5">{t('lsIntro', lang)}</p>

        {latest && (
          <button onClick={() => setResult(latest)} className="mt-4 w-full text-left rounded-2xl border border-white/10 bg-white/4 px-4 py-3 hover:bg-white/6">
            <p className="text-white text-sm font-semibold">{t('lsOpenLast', lang)}</p>
            <p className="text-white/45 text-xs">{t('lsCreatedOn', lang).replace('{date}', new Date(latest.createdAt).toLocaleDateString(locale))}</p>
          </button>
        )}

        {loading && <div className="h-64 rounded-2xl bg-white/5 animate-pulse mt-6" />}
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mt-6">{error}</div>}

        {inputs && (
          <div className="space-y-5 mt-6">
            <fieldset className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-5 space-y-3">
              <legend className="px-1 text-white font-semibold text-sm">{t('lsPeople', lang)}</legend>
              <div>
                <label className={label} htmlFor="ll">{t('lsLandlord', lang)}</label>
                <input id="ll" value={inputs.landlordName} onChange={(e) => set('landlordName', e.target.value)} className={input} />
              </div>
              {inputs.agentName !== null && (
                <div>
                  <label className={label} htmlFor="agent">{t('lsAgent', lang)}</label>
                  <input id="agent" value={inputs.agentName || ''} onChange={(e) => set('agentName', e.target.value)} className={input} />
                </div>
              )}
              <div>
                <label className={label} htmlFor="tenants">{t('lsTenantNames', lang)}</label>
                <textarea id="tenants" rows={2} value={inputs.tenantNames.join('\n')} onChange={(e) => set('tenantNames', e.target.value.split('\n'))} className={input} placeholder={t('lsFullLegalName', lang)} />
              </div>
              <div>
                <label className={label} htmlFor="occ">{t('lsOccupants', lang)}</label>
                <input id="occ" value={inputs.occupants} onChange={(e) => set('occupants', e.target.value)} className={input} placeholder={t('lsOccupantsPh', lang)} />
              </div>
            </fieldset>

            <fieldset className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-5 space-y-3">
              <legend className="px-1 text-white font-semibold text-sm">{t('lsTermMoney', lang)}</legend>
              <p className="text-white/45 text-xs">{inputs.address}{inputs.unitLabel ? `, ${inputs.unitLabel}` : ''}, {inputs.city}</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label} htmlFor="sd">{t('lsStart', lang)}</label><input id="sd" type="date" value={inputs.startDate} onChange={(e) => set('startDate', e.target.value)} className={input} /></div>
                <div>
                  <label className={label} htmlFor="ed">{t('lsEnd', lang)}</label>
                  <input id="ed" type="date" value={inputs.endDate || ''} disabled={!inputs.endDate} onChange={(e) => set('endDate', e.target.value)} className={`${input} disabled:opacity-40`} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-white/70 text-sm">
                <input type="checkbox" checked={!inputs.endDate} onChange={(e) => {
                  if (e.target.checked) set('endDate', null)
                  else { const d = new Date(inputs.startDate + 'T00:00:00'); d.setFullYear(d.getFullYear() + 1); d.setDate(d.getDate() - 1); set('endDate', d.toLocaleDateString('en-CA')) }
                }} className="accent-[#12A5A9]" />
                {t('lsMonthToMonth', lang)}
              </label>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={label} htmlFor="rent">{t('lsRent', lang)}</label><input id="rent" type="number" inputMode="decimal" value={inputs.rent || ''} onChange={(e) => set('rent', Number(e.target.value))} className={input} /></div>
                <div><label className={label} htmlFor="due">{t('lsDueDay', lang)}</label><input id="due" type="number" min={1} max={28} value={inputs.dueDay} onChange={(e) => set('dueDay', Number(e.target.value))} className={input} /></div>
                <div><label className={label} htmlFor="dep">{t('lsDeposit', lang)}</label><input id="dep" type="number" inputMode="decimal" value={inputs.deposit || ''} onChange={(e) => set('deposit', Number(e.target.value))} className={input} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={label} htmlFor="lf">{t('lsLateFee', lang)}</label><input id="lf" type="number" inputMode="decimal" value={inputs.lateFee || ''} onChange={(e) => set('lateFee', Number(e.target.value))} className={input} placeholder="0" /></div>
                <div><label className={label} htmlFor="gr">{t('lsGrace', lang)}</label><input id="gr" type="number" min={0} max={30} value={inputs.graceDays} onChange={(e) => set('graceDays', Number(e.target.value))} className={input} /></div>
                <div><label className={label} htmlFor="nv">{t('lsNotice', lang)}</label><input id="nv" type="number" min={15} max={120} value={inputs.noticeToVacateDays} onChange={(e) => set('noticeToVacateDays', Number(e.target.value))} className={input} /></div>
              </div>
            </fieldset>

            <fieldset className="rounded-2xl border border-white/8 bg-white/3 p-4 sm:p-5 space-y-4">
              <legend className="px-1 text-white font-semibold text-sm">{t('lsHomeRules', lang)}</legend>
              <div>
                <p className={label}>{t('lsUtilities', lang)}</p>
                <div className="grid grid-cols-3 gap-2">
                  {UTILS.map((u) => {
                    const v = inputs.utilities[u.key]
                    return (
                      <button key={u.key} type="button" onClick={() => set('utilities', { ...inputs.utilities, [u.key]: v === 'tenant' ? 'landlord' : 'tenant' })} className={`rounded-xl border px-2 py-2.5 text-left ${v === 'tenant' ? 'border-white/12 bg-white/4' : 'border-[#12A5A9]/40 bg-[#12A5A9]/10'}`}>
                        <span className="block text-white text-sm font-medium">{t(u.label, lang)}</span>
                        <span className="block text-white/50 text-[11px]">{v === 'tenant' ? t('lsTenantPays', lang) : t('lsLandlordPays', lang)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 bg-white/4 rounded-xl p-1" role="radiogroup" aria-label={t('lsPets', lang)}>
                {([['none', t('lsNoPets', lang)], ['with_approval', t('lsWithApproval', lang)], ['allowed', t('lsPetsOk', lang)]] as const).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={inputs.pets === k} onClick={() => set('pets', k)} className={`py-2 rounded-lg text-xs font-semibold ${inputs.pets === k ? 'bg-[#12A5A9] text-white' : 'text-white/60'}`}>{l}</button>
                ))}
              </div>
              {inputs.pets !== 'none' && (
                <div className="w-1/2"><label className={label} htmlFor="pd">{t('lsPetDeposit', lang)}</label><input id="pd" type="number" value={inputs.petDeposit || ''} onChange={(e) => set('petDeposit', Number(e.target.value))} className={input} placeholder="0" /></div>
              )}
              <label className="flex items-center gap-2 text-white/70 text-sm"><input type="checkbox" checked={inputs.smoking} onChange={(e) => set('smoking', e.target.checked)} className="accent-[#12A5A9]" /> {t('lsSmoking', lang)}</label>
              <div><label className={label} htmlFor="pk">{t('lsParking', lang)}</label><input id="pk" value={inputs.parking} onChange={(e) => set('parking', e.target.value)} className={input} placeholder={t('lsParkingPh', lang)} /></div>
              <div>
                <p className={label}>{t('lsPre1978', lang)}</p>
                <div className="grid grid-cols-3 gap-1 bg-white/4 rounded-xl p-1">
                  {([['yes', t('lsYes', lang)], ['no', t('lsNo', lang)], ['unknown', t('lsNotSure', lang)]] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => set('builtBefore1978', k)} className={`py-2 rounded-lg text-xs font-semibold ${inputs.builtBefore1978 === k ? 'bg-[#12A5A9] text-white' : 'text-white/60'}`}>{l}</button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-white/70 text-sm"><input type="checkbox" checked={inputs.inPhiladelphia} onChange={(e) => set('inPhiladelphia', e.target.checked)} className="accent-[#12A5A9]" /> {t('lsInPhilly', lang)}</label>
            </fieldset>

            <fieldset className="rounded-2xl border border-[#12A5A9]/25 bg-[#12A5A9]/5 p-4 sm:p-5">
              <legend className="px-1 text-white font-semibold text-sm">{t('lsAnythingElse', lang)}</legend>
              <textarea rows={4} maxLength={2000} value={inputs.extraNotes} onChange={(e) => set('extraNotes', e.target.value)} className={input} placeholder={t('lsAnythingElsePh', lang)} />
              <p className="text-white/45 text-xs mt-2">{t('lsAnythingElseHint', lang)}</p>
            </fieldset>

            <button onClick={generate} disabled={generating} className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3.5 rounded-2xl disabled:opacity-50">
              {generating ? (inputs.extraNotes ? t('lsWriting', lang) : t('lsCreating', lang)) : t('lsCreate', lang)}
            </button>
            <p className="text-white/35 text-xs text-center">{t('lsFooter', lang)}</p>
          </div>
        )}
      </main>
    </div>
  )
}
