'use client'

import { useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { FileTextIcon } from '@/components/icons'
import { validateDocumentFile } from '@/lib/mediaValidation'
import { hasCentPrecision } from '@/lib/bidRules'
import { useLanguage, t } from '@/lib/i18n'
import { UTILITY_KINDS, UTILITY_LABELS, type UtilityKind, type UtilityCharge } from '@/lib/utilityCharges'
import { scanDocument } from '@/lib/aiFile'

export type DraftCharge = {
  key: string
  id?: string
  kind: UtilityKind
  label: string
  amount: string
  periodStart: string
  periodEnd: string
  file: File | null
  billUrl: string | null
}

export type RentEditValues = {
  rent: number
  charges: DraftCharge[]
  note: string
}

const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })

const inputClass =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition'

const toDraft = (c: UtilityCharge): DraftCharge => ({
  key: c.id,
  id: c.id,
  kind: c.kind,
  label: c.label || '',
  amount: String(c.amount),
  periodStart: c.periodStart || '',
  periodEnd: c.periodEnd || '',
  file: null,
  billUrl: c.billUrl,
})

/**
 * Edit any rent month, paid or not: the rent, any utility bills (water,
 * electric, gas, trash, sewer, internet, other) with the bill itself
 * attached, plus a reason. It shows what the change means before saving, so
 * nobody has to work out who owes what.
 */
export function RentMonthEditor({
  monthLabel,
  rent: initialRent,
  charges: initialCharges,
  lateFee,
  paidSoFar,
  saving,
  error,
  onSave,
  onClose,
}: {
  monthLabel: string
  rent: number
  charges: UtilityCharge[]
  lateFee: number
  paidSoFar: number
  saving: boolean
  error: string | null
  onSave: (values: RentEditValues) => void
  onClose: () => void
}) {
  const lang = useLanguage()
  const [rent, setRent] = useState(String(initialRent))
  const [bills, setBills] = useState<DraftCharge[]>(() => initialCharges.map(toDraft))
  const [openDates, setOpenDates] = useState<Set<string>>(() => new Set(initialCharges.filter((c) => c.periodStart || c.periodEnd).map((c) => c.id)))
  const [note, setNote] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanNote, setScanNote] = useState<string | null>(null)

  const scanBill = async (file: File) => {
    const problem = await validateDocumentFile(file, { allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'] })
    if (problem) {
      setFileError(problem)
      return
    }
    setFileError(null)
    setScanning(true)
    setScanNote(null)
    const r = await scanDocument(file, 'utility_bill')
    setScanning(false)
    const key = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    if ('error' in r) {
      setScanNote(r.error)
      setBills((prev) => [...prev, { key, kind: 'other', label: '', amount: '', periodStart: '', periodEnd: '', file, billUrl: null }])
      return
    }
    const kind = (UTILITY_KINDS as readonly string[]).includes(r.utilityKind || '') ? (r.utilityKind as UtilityKind) : 'other'
    setBills((prev) => [...prev, {
      key,
      kind,
      label: kind === 'other' ? (r.vendor || '').slice(0, 40) : '',
      amount: r.amount ? String(r.amount) : '',
      periodStart: r.periodStart || '',
      periodEnd: r.periodEnd || '',
      file,
      billUrl: null,
    }])
    if (r.periodStart || r.periodEnd) setOpenDates((prev) => new Set(prev).add(key))
    setScanNote(lang === 'es' ? 'Completado desde la factura. Revísalo antes de guardar.' : 'Filled in from the bill, with the bill attached. Check it before saving.')
  }

  const update = (key: string, patch: Partial<DraftCharge>) => setBills((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)))
  const addBill = (kind: UtilityKind) => {
    const key = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setBills((prev) => [...prev, { key, kind, label: '', amount: '', periodStart: '', periodEnd: '', file: null, billUrl: null }])
    setTimeout(() => document.getElementById(`bill-amount-${key}`)?.focus(), 30)
  }

  const rentNum = Number(rent)
  const billNums = bills.map((b) => Number(b.amount || 0))
  const utilities = Math.round(billNums.reduce((a, b) => a + b, 0) * 100) / 100
  // Whole cents only (QA RENT-05/SEC-04: $0.004 water saved, and the
  // change history showed it as $0.00).
  const centsOk = hasCentPrecision(rentNum) && billNums.every((n) => hasCentPrecision(n))
  const billsValid = bills.every((b, i) => b.amount !== '' && Number.isFinite(billNums[i]) && billNums[i] >= 0 && (b.kind !== 'other' || b.label.trim()))
  const validNumbers = rent !== '' && Number.isFinite(rentNum) && rentNum >= 0 && billsValid && centsOk
  const datesOk = bills.every((b) => !b.periodStart || !b.periodEnd || b.periodEnd >= b.periodStart)
  const total = validNumbers ? Math.round((rentNum + utilities + lateFee) * 100) / 100 : 0
  const difference = Math.round((total - paidSoFar) * 100) / 100

  const initialSignature = JSON.stringify(initialCharges.map(toDraft).map(({ file, billUrl, ...rest }) => rest))
  const currentSignature = JSON.stringify(bills.map(({ file, billUrl, ...rest }) => rest))
  const changed =
    rentNum !== initialRent ||
    initialSignature !== currentSignature ||
    bills.some((b) => b.file) ||
    note.trim() !== ''

  let outcome: { text: string; tone: string }
  if (!centsOk) {
    outcome = { text: t('wholeCentsPositive', lang), tone: 'text-red-400' }
  } else if (!validNumbers) {
    outcome = { text: t('enterAmountsToSeeTotal', lang), tone: 'text-white/50' }
  } else if (difference > 0) {
    outcome = {
      text: paidSoFar > 0
        ? `${t('newTotalPrefix', lang)}${money(total)}${t('alreadyPaidOwesMoreMiddle', lang)}${money(paidSoFar)}${t('owesMoreSuffix', lang)}${money(difference)}${t('moreSuffix', lang)}`
        : `${t('newTotalPrefix', lang)}${money(total)}${t('tenantOwesInFullSuffix', lang)}`,
      tone: 'text-yellow-400',
    }
  } else if (difference < 0) {
    outcome = {
      text: `${t('newTotalPrefix', lang)}${money(total)}${t('alreadyPaidTooMuchMiddle', lang)}${money(paidSoFar)}${t('thatsTooMuchPrefix', lang)}${money(-difference)}${t('tooMuchSuffix', lang)}`,
      tone: 'text-[#12A5A9]',
    }
  } else {
    outcome = { text: `${t('newTotalPrefix', lang)}${money(total)}${t('fullyPaidNothingMore', lang)}`, tone: 'text-[#12A5A9]' }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-[#0F2138] border border-white/10 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-6 motion-safe:animate-[floatUp_0.25s_ease-out]">
        <h3 className="text-white font-semibold text-lg">{t('editMonthPrefix', lang)}{monthLabel}</h3>
        <p className="text-white/50 text-xs mt-1">{t('rentEditSavedNote', lang)}</p>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="edit-rent" className="text-white/70 text-sm block mb-1">{t('rentForTheMonthLabel', lang)}</label>
            <input id="edit-rent" type="number" inputMode="decimal" min={0} step="0.01" value={rent} onChange={(e) => setRent(e.target.value)} className={inputClass} />
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-white text-sm font-semibold">{t('utilityBillsLabel', lang)}</p>
              {utilities > 0 && <p className="text-white/60 text-sm tabular-nums">{money(utilities)}</p>}
            </div>
            <p className="text-white/45 text-xs mt-0.5">{t('utilityBillsHelp', lang)}</p>

            {bills.length > 0 && (
              <ul className="mt-3 space-y-2.5">
                {bills.map((b) => {
                  const datesOpen = openDates.has(b.key)
                  const badDates = !!b.periodStart && !!b.periodEnd && b.periodEnd < b.periodStart
                  return (
                    <li key={b.key} className="rounded-xl border border-white/10 bg-[#0C1A2E]/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <select
                          aria-label={t('billNameLabel', lang)}
                          value={b.kind}
                          onChange={(e) => update(b.key, { kind: e.target.value as UtilityKind })}
                          className="bg-transparent text-white text-sm font-semibold focus:outline-none cursor-pointer -ml-0.5"
                        >
                          {UTILITY_KINDS.map((k) => (
                            <option key={k} value={k} className="bg-[#0F2138]">{UTILITY_LABELS[k][lang === 'es' ? 'es' : 'en']}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setBills((prev) => prev.filter((x) => x.key !== b.key))}
                          aria-label={t('removeBillAria', lang)}
                          className="w-8 h-8 -mr-1 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition flex items-center justify-center text-lg leading-none"
                        >
                          ×
                        </button>
                      </div>
                      <div className={`grid gap-2.5 mt-2 ${b.kind === 'other' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                        {b.kind === 'other' && (
                          <div>
                            <label htmlFor={`bill-label-${b.key}`} className="text-white/50 text-xs block mb-1">{t('billNameLabel', lang)}</label>
                            <input id={`bill-label-${b.key}`} type="text" maxLength={40} placeholder={t('billNamePlaceholder', lang)} value={b.label} onChange={(e) => update(b.key, { label: e.target.value })} className={inputClass} />
                          </div>
                        )}
                        <div>
                          <label htmlFor={`bill-amount-${b.key}`} className="text-white/50 text-xs block mb-1">{t('billAmountLabel', lang)}</label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
                            <input id={`bill-amount-${b.key}`} type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" value={b.amount} onChange={(e) => update(b.key, { amount: e.target.value })} className={`${inputClass} pl-7`} />
                          </div>
                        </div>
                      </div>

                      {datesOpen && (
                        <div className="grid grid-cols-2 gap-2.5 mt-2.5">
                          <div>
                            <label htmlFor={`bill-from-${b.key}`} className="text-white/50 text-xs block mb-1">{t('fromLabel', lang)}</label>
                            <input id={`bill-from-${b.key}`} type="date" value={b.periodStart} onChange={(e) => update(b.key, { periodStart: e.target.value })} className={inputClass} />
                          </div>
                          <div>
                            <label htmlFor={`bill-to-${b.key}`} className="text-white/50 text-xs block mb-1">{t('toLabel', lang)}</label>
                            <input id={`bill-to-${b.key}`} type="date" value={b.periodEnd} onChange={(e) => update(b.key, { periodEnd: e.target.value })} className={inputClass} />
                          </div>
                          {badDates && <p className="col-span-2 text-red-400 text-xs">{t('endDateBeforeStartDate', lang)}</p>}
                        </div>
                      )}

                      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap mt-2.5">
                        <label className="text-[#12A5A9] text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 hover:underline py-1">
                          <FileTextIcon className="w-3.5 h-3.5" />
                          {b.billUrl || b.file ? t('replaceBill', lang) : t('attachBillCta', lang)}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                            className="hidden"
                            onChange={async (e) => {
                              const input = e.target
                              const file = input.files?.[0]
                              input.value = ''
                              if (!file) return
                              const problem = await validateDocumentFile(file, { allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'] })
                              if (problem) {
                                setFileError(problem)
                                return
                              }
                              setFileError(null)
                              update(b.key, { file })
                            }}
                          />
                        </label>
                        {b.billUrl && !b.file && (
                          <a href={b.billUrl} target="_blank" rel="noopener noreferrer" className="text-white/60 text-xs hover:text-white hover:underline py-1">
                            {t('viewBill', lang)} →
                          </a>
                        )}
                        {!datesOpen && (
                          <button type="button" onClick={() => setOpenDates((prev) => new Set(prev).add(b.key))} className="text-white/50 text-xs hover:text-white py-1">
                            {t('billDatesToggle', lang)}
                          </button>
                        )}
                      </div>
                      {b.file && <p className="text-white/50 text-[11px] mt-1 truncate">{t('billFileReady', lang)} {b.file.name}</p>}
                    </li>
                  )
                })}
              </ul>
            )}

            <label className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#12A5A9]/40 bg-[#12A5A9]/8 py-2.5 text-[#12A5A9] text-sm font-semibold cursor-pointer hover:bg-[#12A5A9]/12">
              {scanning ? (lang === 'es' ? 'Leyendo la factura…' : 'Reading the bill…') : (lang === 'es' ? '✦ Escanear una factura' : '✦ Scan a bill (photo or PDF)')}
              <input type="file" accept="image/*,.pdf,application/pdf" className="hidden" disabled={scanning} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) scanBill(f) }} />
            </label>
            {scanNote && <p className="text-white/55 text-xs mt-1.5">{scanNote}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              {UTILITY_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => addBill(k)}
                  className="text-xs font-medium text-white/80 bg-white/6 border border-white/10 rounded-full px-3 py-1.5 hover:bg-[#12A5A9]/15 hover:border-[#12A5A9]/40 hover:text-white transition"
                >
                  {t('addBillChipPrefix', lang)}{UTILITY_LABELS[k][lang === 'es' ? 'es' : 'en']}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="edit-note" className="text-white/70 text-sm block mb-1">{t('reasonOptionalLabel', lang)}</label>
            <input id="edit-note" type="text" maxLength={140} placeholder={t('rentEditReasonPlaceholder', lang)} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          </div>

          {lateFee > 0 && <p className="text-white/50 text-xs">{t('includesLateFeePrefix', lang)}{money(lateFee)}{t('includesLateFeeSuffix', lang)}</p>}

          <div className={`rounded-xl bg-white/4 border border-white/8 px-4 py-3 text-sm ${outcome.tone}`} aria-live="polite">
            {outcome.text}
          </div>

          {(fileError || error) && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{fileError || error}</div>
          )}
        </div>

        <div className="flex items-center gap-3 mt-6">
          <RippleButton
            onClick={() => onSave({ rent: rentNum, charges: bills, note: note.trim() })}
            disabled={saving || !validNumbers || !datesOk || !changed}
            className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t('savingChangesDots', lang) : t('saveChangesBtn', lang)}
          </RippleButton>
          <button type="button" onClick={onClose} disabled={saving} className="text-white/50 hover:text-white text-sm transition disabled:opacity-50">
            {t('cancel', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
