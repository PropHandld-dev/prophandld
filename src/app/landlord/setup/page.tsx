'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Logo } from '@/components/Logo'
import { AddressAutocomplete, type AutocompletePlace } from '@/components/AddressAutocomplete'
import { ContactInviteInput, type ContactMode } from '@/components/ContactInviteInput'
import { StripeConnectCard } from '@/components/StripeConnectCard'
import { ZelleVenmoCashAppCard } from '@/components/ZelleVenmoCashAppCard'
import { SubscribeToAdd } from '@/components/BillingReminder'
import { DraftNote } from '@/components/DraftNote'
import { FirstMonthChoice } from '@/components/FirstMonthChoice'
import { CheckCircleIcon, BuildingIcon, UserIcon, DollarSignIcon } from '@/components/icons'
import { useBillingStatus, BILLING_ENFORCED } from '@/lib/useBillingStatus'
import { useConfirm } from '@/lib/useConfirm'
import { useDraft } from '@/lib/useDraft'
import { createOwnProperty, linkOrInviteTenant } from '@/lib/landlordSetup'
import { useLanguage, t } from '@/lib/i18n'

// Guided setup: a new landlord's first few minutes, one question per
// screen — address, how many units, who lives there (contact, rent, lease
// start), and how they want to collect rent. Every answer is auto-saved
// (lib/useDraft), so closing the app, a refresh, or the round trip to
// Stripe's payout setup picks up on the same question. The property is
// created right after the units question, so nothing typed later can be
// lost to a failed save, and the saves themselves are the same ones the
// full forms use (lib/landlordSetup.ts).

type Step = 'address' | 'units' | 'tenantWho' | 'tenantRent' | 'tenantLease' | 'tenantDone' | 'paid' | 'done'
type Pay = 'online' | 'apps' | 'later'

type SetupDraft = {
  step: Step
  address: string
  city: string
  state: string
  zip: string
  geo: { lat: number; lng: number } | null
  numUnits: number
  propertyId: string | null
  units: { id: string; unit_number: string }[]
  unitIdx: number
  contactMode: ContactMode
  contact: string
  rent: string
  dueDay: string
  leaseStart: string
  leaseEnd: string
  firstMonth: 'prorate' | 'full'
  tenants: { unitId: string; who: string; result: 'linked' | 'invited' }[]
  pay: Pay | null
}

const EMPTY: SetupDraft = {
  step: 'address',
  address: '',
  city: '',
  state: '',
  zip: '',
  geo: null,
  numUnits: 1,
  propertyId: null,
  units: [],
  unitIdx: 0,
  contactMode: 'email',
  contact: '',
  rent: '',
  dueDay: '1',
  leaseStart: '',
  leaseEnd: '',
  firstMonth: 'prorate',
  tenants: [],
  pay: null,
}

const PROGRESS: Record<Step, number> = { address: 0, units: 1, tenantWho: 2, tenantRent: 2, tenantLease: 2, tenantDone: 2, paid: 3, done: 4 }

const input = 'w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-lg placeholder-white/35 focus:outline-none focus:border-[#12A5A9] focus:ring-4 focus:ring-[#12A5A9]/15 transition'

function Setup() {
  const router = useRouter()
  const params = useSearchParams()
  const lang = useLanguage()
  const billing = useBillingStatus()
  const { confirm, ConfirmDialog } = useConfirm()
  const [userId, setUserId] = useState<string | null>(null)
  const [d, setD] = useState<SetupDraft>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [moreUnits, setMoreUnits] = useState(false)
  // "Restored your draft" only on the screen they came back to.
  const [resumedAt, setResumedAt] = useState<Step | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/login')
      else setUserId(user.id)
    })
  }, [router])

  const draft = useDraft<SetupDraft>({
    name: 'landlord-setup',
    userId,
    value: d,
    onRestore: (saved) => {
      setD({ ...EMPTY, ...saved })
      setResumedAt(saved.step)
    },
    isEmpty: (v) => v.step === 'address' && !v.address.trim(),
  })

  const set = (patch: Partial<SetupDraft>) => setD((prev) => ({ ...prev, ...patch }))
  const go = (step: Step) => {
    setError(null)
    set({ step })
    window.scrollTo({ top: 0 })
  }

  const unit = d.units[d.unitIdx]
  const unitLabel = (u?: { unit_number: string }) => (!u || u.unit_number === 'Main' ? d.address : `${t('unitLabelPrefix', lang)} ${u.unit_number}`)
  const openUnits = d.units.filter((u) => !d.tenants.some((x) => x.unitId === u.id))
  const billingBlocked = BILLING_ENFORCED && billing.needsPayment && billing.trialExpired

  const finishHref = (() => {
    // Carries a pending "request to be managed" outcome through to Home's
    // PmRequestStatusBanner, the same way properties/new?onboarding=1 did.
    if (params.get('pmRequestSent') === '1') return '/landlord?pmRequestSent=1'
    if (params.get('pmRequestFailed') === '1') return '/landlord?pmRequestFailed=1'
    return '/landlord'
  })()

  const createProperty = async () => {
    setBusy(true)
    setError(null)
    const res = await createOwnProperty(
      { address: d.address.trim(), city: d.city.trim(), state: d.state.trim(), zip: d.zip.trim(), propertyType: 'residential', numUnits: d.numUnits, geo: d.geo },
      lang,
      () => confirm({ body: t('addressRegisteredOther', lang) }),
    )
    setBusy(false)
    if ('cancelled' in res) return
    if ('error' in res) {
      setError(res.error)
      return
    }
    set({ propertyId: res.propertyId, units: res.unitIds, unitIdx: 0, step: 'tenantWho' })
  }

  const sendInvite = async () => {
    if (!unit) return
    setBusy(true)
    setError(null)
    const res = await linkOrInviteTenant(unit.id, d.contactMode, d.contact, { rent_amount: d.rent, rent_due_day: d.dueDay, lease_start: d.leaseStart, lease_end: d.leaseEnd, first_month_proration: d.firstMonth }, lang)
    setBusy(false)
    if ('error' in res) {
      setError(res.error)
      return
    }
    set({ tenants: [...d.tenants, { unitId: unit.id, who: d.contact.trim(), result: res.result }], step: 'tenantDone' })
  }

  const startNextTenant = () => {
    const next = d.units.findIndex((u) => !d.tenants.some((x) => x.unitId === u.id))
    set({ unitIdx: Math.max(0, next), contact: '', rent: '', dueDay: '1', leaseStart: '', leaseEnd: '', firstMonth: 'prorate', step: 'tenantWho' })
    setError(null)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (d.step === 'address') {
      if (!d.address.trim() || !d.city.trim() || !d.state.trim()) {
        setError(t('setupAddressMore', lang))
        return
      }
      go('units')
    } else if (d.step === 'units') {
      if (!d.numUnits || d.numUnits < 1 || d.numUnits > 50) return
      await createProperty()
    } else if (d.step === 'tenantWho') {
      if (!d.contact.trim()) {
        setError(d.contactMode === 'email' ? t('enterRenterEmailError', lang) : t('enterRenterPhoneError', lang))
        return
      }
      go('tenantRent')
    } else if (d.step === 'tenantRent') {
      go('tenantLease')
    } else if (d.step === 'tenantLease') {
      if (!d.leaseStart) {
        setError(t('enterLeaseStartError', lang))
        return
      }
      await sendInvite()
    } else if (d.step === 'paid') {
      go('done')
    }
  }

  const back = () => {
    const prev: Partial<Record<Step, Step>> = { units: 'address', tenantRent: 'tenantWho', tenantLease: 'tenantRent', paid: d.tenants.length ? 'tenantDone' : 'tenantWho' }
    const to = prev[d.step]
    if (to) go(to)
  }
  const canGoBack = d.step === 'units' || d.step === 'tenantRent' || d.step === 'tenantLease' || d.step === 'paid'

  const step = PROGRESS[d.step]
  const STEP_ICONS = [BuildingIcon, BuildingIcon, UserIcon, DollarSignIcon]
  const stepNames = [t('setupStepProperty', lang), t('setupStepUnits', lang), t('setupStepTenant', lang), t('setupStepPaid', lang)]

  return (
    <div className="min-h-screen bg-[#0C1A2E] flex flex-col">
      <header className="px-5 sm:px-8 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 flex items-center justify-between gap-4">
        <Link href="/landlord" className="flex items-center gap-2 text-white font-semibold">
          <Logo className="w-[26px] h-[26px]" />
          <span className="hidden sm:inline">Prophandld</span>
        </Link>
        {d.step !== 'done' && (
          <Link href={finishHref} className="text-white/50 hover:text-white text-sm transition">
            {t('setupSkip', lang)}
          </Link>
        )}
      </header>

      {/* Four-part progress: property, units, tenant, getting paid. */}
      <div className="px-5 sm:px-8 max-w-2xl w-full mx-auto">
        <div className="grid grid-cols-4 gap-2" aria-label={t('setupQuestionOf', lang).replace('{n}', String(Math.min(step + 1, 4)))}>
          {stepNames.map((name, i) => {
            const Icon = STEP_ICONS[i]
            return (
              <div key={name}>
                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] transition-[width] duration-500 ease-out ${i < step ? 'w-full' : i === step ? 'w-1/2' : 'w-0'}`} />
                </div>
                <p className={`mt-2 hidden sm:flex items-center gap-1.5 text-xs font-medium ${i <= step ? 'text-white/70' : 'text-white/30'}`}>
                  <Icon className="w-3.5 h-3.5" /> {name}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      <main className="flex-1 px-5 sm:px-8 pt-10 sm:pt-16 pb-32 max-w-2xl w-full mx-auto">
        <DraftNote restored={draft.restored && resumedAt === d.step && d.step !== 'done'} savedAt={null} onDiscard={() => { draft.clear(); setD(EMPTY); setResumedAt(null) }} className="mb-8" />

        {billingBlocked && !d.propertyId ? (
          <SubscribeToAdd what={t('propertiesWord', lang)} />
        ) : (
          <form key={d.step} onSubmit={onSubmit} className="motion-safe:animate-[fadeIn_0.35s_ease-out]" noValidate>
            {d.step === 'address' && (
              <Question title={t('setupAddressQ', lang)} hint={t('setupAddressHint', lang)}>
                <AddressAutocomplete
                  id="setup-address"
                  value={d.address}
                  onChange={(v) => set({ address: v, geo: null })}
                  onPlaceSelected={(p: AutocompletePlace) =>
                    set({ address: p.address || d.address, city: p.city || d.city, state: p.state || d.state, zip: p.zip || d.zip, geo: p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null })
                  }
                  placeholder={t('startTypingAddress', lang)}
                  className={input}
                />
                {/* Filled by the suggestion; shown so a typed address can be completed by hand. */}
                <div className="grid grid-cols-[1fr_5rem_7rem] gap-2 mt-3">
                  <input aria-label={t('cityLabel', lang)} value={d.city} onChange={(e) => set({ city: e.target.value })} placeholder={t('cityLabel', lang)} className={`${input} !text-base !py-3`} />
                  <input aria-label={t('stateLabel', lang)} value={d.state} onChange={(e) => set({ state: e.target.value.toUpperCase().slice(0, 2) })} placeholder="PA" className={`${input} !text-base !py-3`} />
                  <input aria-label={t('zipCodeLabel', lang)} value={d.zip} onChange={(e) => set({ zip: e.target.value })} placeholder="19103" inputMode="numeric" className={`${input} !text-base !py-3`} />
                </div>
              </Question>
            )}

            {d.step === 'units' && (
              <Question title={t('setupUnitsQ', lang)} hint={t('setupUnitsHint', lang)} context={d.address}>
                <div className="grid grid-cols-5 gap-2.5">
                  {[1, 2, 3, 4].map((n) => (
                    <Chip key={n} active={!moreUnits && d.numUnits === n} onClick={() => { setMoreUnits(false); set({ numUnits: n }) }}>
                      <span className="text-2xl font-bold tabular-nums">{n}</span>
                    </Chip>
                  ))}
                  <Chip active={moreUnits} onClick={() => { setMoreUnits(true); if (d.numUnits < 5) set({ numUnits: 5 }) }}>
                    <span className="text-2xl font-bold">5+</span>
                  </Chip>
                </div>
                {moreUnits && (
                  <input
                    type="number"
                    min={5}
                    max={50}
                    autoFocus
                    aria-label={t('setupUnitsMore', lang)}
                    value={d.numUnits}
                    onChange={(e) => set({ numUnits: Math.max(1, Math.min(50, parseInt(e.target.value) || 0)) })}
                    className={`${input} mt-3 tabular-nums`}
                  />
                )}
              </Question>
            )}

            {d.step === 'tenantWho' && (
              <Question
                title={t('setupTenantQ', lang)}
                hint={t('setupTenantHint', lang)}
                context={d.units.length > 1 ? undefined : d.address}
                done={!d.tenants.length ? t('setupPropertyAdded', lang) : undefined}
              >
                {d.units.length > 1 && (
                  <div className="mb-5">
                    <p className="text-white/50 text-sm mb-2">{t('setupWhichUnit', lang)}</p>
                    <div className="flex flex-wrap gap-2">
                      {openUnits.map((u) => {
                        const i = d.units.indexOf(u)
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => set({ unitIdx: i })}
                            className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${d.unitIdx === i ? 'bg-[#12A5A9] border-[#12A5A9] text-white' : 'border-white/15 text-white/70 hover:border-white/30'}`}
                          >
                            {unitLabel(u)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                <div className="[&_input]:!text-lg [&_input]:!py-4 [&_input]:!rounded-2xl">
                  <ContactInviteInput
                    mode={d.contactMode}
                    onModeChange={(m) => set({ contactMode: m, contact: '' })}
                    value={d.contact}
                    onChange={(v) => set({ contact: v })}
                    emailPlaceholder="tenant@email.com"
                    phonePlaceholder="(215) 555-0134"
                  />
                </div>
                <button type="button" onClick={() => go('paid')} className="mt-5 text-white/50 hover:text-white text-sm font-medium underline-offset-4 hover:underline">
                  {t('setupVacant', lang)}
                </button>
              </Question>
            )}

            {d.step === 'tenantRent' && (
              <Question title={t('setupRentQ', lang)} hint={t('setupRentHint', lang)} context={`${d.contact} · ${unitLabel(unit)}`}>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/40 text-2xl font-semibold">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    autoFocus
                    aria-label={t('setupRentQ', lang)}
                    value={d.rent}
                    onChange={(e) => set({ rent: e.target.value })}
                    placeholder="1,450"
                    className={`${input} !pl-11 !text-3xl font-bold tabular-nums`}
                  />
                </div>
                <p className="text-white/50 text-sm mt-6 mb-2">{t('setupDueOn', lang)}</p>
                <div className="flex flex-wrap gap-2">
                  {['1', '5', '15'].map((day) => (
                    <Chip key={day} small active={d.dueDay === day} onClick={() => set({ dueDay: day })}>
                      {lang === 'es' ? `día ${day}` : `${day}${day === '1' ? 'st' : 'th'}`}
                    </Chip>
                  ))}
                  <select
                    aria-label={t('setupDueOther', lang)}
                    value={['1', '5', '15'].includes(d.dueDay) ? '' : d.dueDay}
                    onChange={(e) => e.target.value && set({ dueDay: e.target.value })}
                    className={`px-4 py-2 rounded-full text-sm font-semibold border bg-transparent ${['1', '5', '15'].includes(d.dueDay) ? 'border-white/15 text-white/70' : 'border-[#12A5A9] text-[#12A5A9]'}`}
                  >
                    <option value="" className="bg-[#0C1A2E]">{t('setupDueOther', lang)}</option>
                    {Array.from({ length: 28 }, (_, i) => String(i + 1)).filter((x) => !['1', '5', '15'].includes(x)).map((x) => (
                      <option key={x} value={x} className="bg-[#0C1A2E]">{x}</option>
                    ))}
                  </select>
                </div>
              </Question>
            )}

            {d.step === 'tenantLease' && (
              <Question title={t('setupLeaseQ', lang)} hint={t('setupLeaseHint', lang)} context={`${d.contact} · ${unitLabel(unit)}`}>
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-white/60 text-sm block mb-1.5">{t('setupLeaseStart', lang)}</span>
                    <input type="date" required value={d.leaseStart} onChange={(e) => set({ leaseStart: e.target.value })} className={input} />
                  </label>
                  <label className="block">
                    <span className="text-white/60 text-sm block mb-1.5">{t('setupLeaseEnd', lang)}</span>
                    <input type="date" min={d.leaseStart || undefined} value={d.leaseEnd} onChange={(e) => set({ leaseEnd: e.target.value })} className={input} />
                  </label>
                </div>
                <div className="mt-6">
                  <FirstMonthChoice value={d.firstMonth} onChange={(v) => set({ firstMonth: v })} rent={Number(d.rent) || 0} leaseStart={d.leaseStart} dueDay={Number(d.dueDay) || 1} />
                </div>
              </Question>
            )}

            {d.step === 'tenantDone' && (() => {
              const last = d.tenants[d.tenants.length - 1]
              return (
                <div className="text-center py-4">
                  <span className="w-16 h-16 mx-auto rounded-full bg-emerald-500/12 text-emerald-400 grid place-items-center mb-6 motion-safe:animate-[popIn_0.4s_ease-out]">
                    <CheckCircleIcon className="w-8 h-8" />
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3 text-balance">
                    {(last?.result === 'linked' ? t('setupLinked', lang) : t('setupInvited', lang)).replace('{who}', last?.who || '')}
                  </h1>
                  {last?.result === 'invited' && <p className="text-white/50 max-w-md mx-auto">{t('setupInvitedHint', lang)}</p>}
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-10">
                    <button type="button" onClick={() => go('paid')} className="w-full sm:w-auto bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-8 py-3.5 rounded-full hover:opacity-90 transition">
                      {t('setupContinue', lang)}
                    </button>
                    {openUnits.length > 0 && (
                      <button type="button" onClick={startNextTenant} className="w-full sm:w-auto border border-white/15 text-white font-semibold px-6 py-3.5 rounded-full hover:border-white/30 transition">
                        {t('setupAnotherTenant', lang)}
                      </button>
                    )}
                  </div>
                </div>
              )
            })()}

            {d.step === 'paid' && (
              <Question title={t('setupPaidQ', lang)} hint={t('setupPaidHint', lang)}>
                <div className="space-y-3" role="radiogroup" aria-label={t('setupPaidQ', lang)}>
                  {([
                    { key: 'online', title: t('setupPaidOnline', lang), desc: t('setupPaidOnlineDesc', lang), badge: t('setupRecommended', lang) },
                    { key: 'apps', title: t('setupPaidApps', lang), desc: t('setupPaidAppsDesc', lang) },
                    { key: 'later', title: t('setupPaidLater', lang), desc: t('setupPaidLaterDesc', lang) },
                  ] as { key: Pay; title: string; desc: string; badge?: string }[]).map((o) => (
                    <div key={o.key}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={d.pay === o.key}
                        onClick={() => set({ pay: o.key })}
                        className={`w-full text-left rounded-2xl border p-5 transition flex items-start gap-4 ${d.pay === o.key ? 'border-[#12A5A9] bg-[#12A5A9]/8 ring-4 ring-[#12A5A9]/10' : 'border-white/10 bg-white/3 hover:border-white/25'}`}
                      >
                        <span className={`mt-1 w-5 h-5 rounded-full border-2 shrink-0 grid place-items-center ${d.pay === o.key ? 'border-[#12A5A9]' : 'border-white/25'}`}>
                          {d.pay === o.key && <span className="w-2.5 h-2.5 rounded-full bg-[#12A5A9]" />}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-semibold">{o.title}</span>
                            {o.badge && <span className="text-[11px] font-semibold text-[#12A5A9] bg-[#12A5A9]/12 border border-[#12A5A9]/25 rounded-full px-2 py-0.5">{o.badge}</span>}
                          </span>
                          <span className="block text-white/50 text-sm mt-1 leading-relaxed">{o.desc}</span>
                        </span>
                      </button>
                      {/* The real cards from Profile, unchanged: Stripe payout setup, and the
                          Zelle/Venmo/check/cash card with its re-auth and 48-hour freeze rule. */}
                      {d.pay === o.key && o.key === 'online' && <div className="mt-3"><StripeConnectCard purpose="rent" returnTo="/landlord/setup" /></div>}
                      {d.pay === o.key && o.key === 'apps' && <div className="mt-3"><ZelleVenmoCashAppCard /></div>}
                    </div>
                  ))}
                </div>
              </Question>
            )}

            {d.step === 'done' && (
              <div className="text-center py-4">
                <span className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-[#0A7B7E] to-[#12A5A9] text-white grid place-items-center mb-7 shadow-[0_0_0_10px_rgba(18,165,169,0.12)] motion-safe:animate-[popIn_0.45s_ease-out]">
                  <CheckCircleIcon className="w-10 h-10" />
                </span>
                <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">{t('setupDoneTitle', lang)}</h1>
                <p className="text-white/50 max-w-md mx-auto mb-8">{t('setupDoneDesc', lang)}</p>
                <ul className="text-left max-w-md mx-auto bg-white/3 border border-white/8 rounded-2xl divide-y divide-white/5 mb-10">
                  <SummaryRow icon={BuildingIcon} text={(d.units.length || d.numUnits) === 1 ? `${d.address} · ${t('setupOneUnit', lang)}` : t('setupSummaryProperty', lang).replace('{address}', d.address).replace('{n}', String(d.units.length || d.numUnits))} />
                  {d.tenants.length ? (
                    d.tenants.map((x) => <SummaryRow key={x.unitId} icon={UserIcon} text={`${x.who} · ${unitLabel(d.units.find((u) => u.id === x.unitId))}`} />)
                  ) : (
                    <SummaryRow icon={UserIcon} text={t('setupSummaryNoTenant', lang)} muted />
                  )}
                  <SummaryRow
                    icon={DollarSignIcon}
                    text={t('setupSummaryPaid', lang).replace('{how}', d.pay === 'online' ? t('setupPaidOnline', lang) : d.pay === 'apps' ? t('setupPaidApps', lang) : t('setupPaidLater', lang))}
                    muted={!d.pay || d.pay === 'later'}
                  />
                </ul>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => { draft.clear(); router.replace(finishHref) }}
                    className="w-full sm:w-auto bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-8 py-3.5 rounded-full hover:opacity-90 transition"
                  >
                    {t('setupGoHome', lang)}
                  </button>
                  <button
                    type="button"
                    onClick={() => { draft.clear(); setD(EMPTY); setMoreUnits(false) }}
                    className="w-full sm:w-auto border border-white/15 text-white font-semibold px-6 py-3.5 rounded-full hover:border-white/30 transition"
                  >
                    {t('setupAddAnotherProperty', lang)}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-6 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm" role="alert">
                {error}
              </div>
            )}

            {d.step !== 'tenantDone' && d.step !== 'done' && (
              <div className="mt-10 flex items-center gap-4">
                {canGoBack && (
                  <button type="button" onClick={back} className="text-white/60 hover:text-white font-medium px-2 py-3 transition">
                    ← {t('setupBack', lang)}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={busy || (d.step === 'paid' && !d.pay)}
                  className="ml-auto bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-8 py-3.5 rounded-full hover:opacity-90 transition disabled:opacity-40 min-w-[10rem]"
                >
                  {busy
                    ? d.step === 'units' ? t('setupCreating', lang) : t('setupSending', lang)
                    : d.step === 'tenantLease' ? t('setupSendInvite', lang) : d.step === 'paid' ? t('setupFinish', lang) : t('setupContinue', lang)}
                </button>
              </div>
            )}
          </form>
        )}
      </main>
      {ConfirmDialog}
    </div>
  )
}

function Question({ title, hint, context, done, children }: { title: string; hint: string; context?: string; done?: string; children: React.ReactNode }) {
  return (
    <div>
      {done && (
        <p className="inline-flex items-center gap-1.5 text-emerald-400 text-sm font-semibold mb-4">
          <CheckCircleIcon className="w-4 h-4" /> {done}
        </p>
      )}
      {context && <p className="text-[#12A5A9] text-sm font-semibold mb-2 truncate">{context}</p>}
      <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight text-balance leading-tight">{title}</h1>
      <p className="text-white/50 mt-3 mb-8 leading-relaxed max-w-lg">{hint}</p>
      {children}
    </div>
  )
}

function Chip({ active, onClick, small = false, children }: { active: boolean; onClick: () => void; small?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`border transition ${small ? 'px-4 py-2 rounded-full text-sm font-semibold' : 'aspect-square rounded-2xl grid place-items-center'} ${
        active ? 'bg-[#12A5A9]/15 border-[#12A5A9] text-white ring-4 ring-[#12A5A9]/10' : 'bg-white/3 border-white/10 text-white/70 hover:border-white/25'
      }`}
    >
      {children}
    </button>
  )
}

function SummaryRow({ icon: Icon, text, muted = false }: { icon: typeof BuildingIcon; text: string; muted?: boolean }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <Icon className={`w-4 h-4 shrink-0 ${muted ? 'text-white/30' : 'text-[#12A5A9]'}`} />
      <span className={`text-sm truncate ${muted ? 'text-white/40' : 'text-white/80'}`}>{text}</span>
    </li>
  )
}

export default function SetupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0C1A2E]" />}>
      <Setup />
    </Suspense>
  )
}
