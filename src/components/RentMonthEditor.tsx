'use client'

import { useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { FileTextIcon } from '@/components/icons'

export type RentEditValues = {
  rent: number
  water: number
  periodStart: string
  periodEnd: string
  note: string
}

const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })

const inputClass =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition'

/**
 * Edit any rent month, paid or not: the rent, the water bill and the period
 * it covers, plus a reason. It shows what the change means before saving, so
 * the landlord never has to work out who owes what.
 */
export function RentMonthEditor({
  monthLabel,
  rent: initialRent,
  water: initialWater,
  lateFee,
  paidSoFar,
  periodStart: initialStart,
  periodEnd: initialEnd,
  hasBillFile,
  billFileUrl,
  uploading,
  saving,
  error,
  onSave,
  onAttach,
  onClose,
}: {
  monthLabel: string
  rent: number
  water: number
  lateFee: number
  paidSoFar: number
  periodStart: string
  periodEnd: string
  hasBillFile: boolean
  billFileUrl?: string
  uploading: boolean
  saving: boolean
  error: string | null
  onSave: (values: RentEditValues) => void
  onAttach: (file: File) => void
  onClose: () => void
}) {
  const [rent, setRent] = useState(String(initialRent))
  const [water, setWater] = useState(initialWater ? String(initialWater) : '')
  const [periodStart, setPeriodStart] = useState(initialStart)
  const [periodEnd, setPeriodEnd] = useState(initialEnd)
  const [note, setNote] = useState('')

  const rentNum = Number(rent)
  const waterNum = Number(water || 0)
  const validNumbers = rent !== '' && rentNum >= 0 && waterNum >= 0
  const periodOrderOk = !periodStart || !periodEnd || periodEnd >= periodStart
  const total = validNumbers ? rentNum + waterNum + lateFee : 0
  const difference = Math.round((total - paidSoFar) * 100) / 100

  const changed =
    rentNum !== initialRent ||
    waterNum !== initialWater ||
    periodStart !== initialStart ||
    periodEnd !== initialEnd ||
    note.trim() !== ''

  let outcome: { text: string; tone: string }
  if (!validNumbers) {
    outcome = { text: 'Enter the amounts to see the new total.', tone: 'text-white/50' }
  } else if (difference > 0) {
    outcome = {
      text: paidSoFar > 0
        ? `New total ${money(total)}. Already paid ${money(paidSoFar)}, so the tenant will owe ${money(difference)} more.`
        : `New total ${money(total)}. The tenant owes it in full.`,
      tone: 'text-yellow-400',
    }
  } else if (difference < 0) {
    outcome = {
      text: `New total ${money(total)}. Already paid ${money(paidSoFar)}: that's ${money(-difference)} too much. After saving you can refund it or credit it to next month.`,
      tone: 'text-[#12A5A9]',
    }
  } else {
    outcome = { text: `New total ${money(total)}. Fully paid, nothing more to collect.`, tone: 'text-[#12A5A9]' }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-[#0F2138] border border-white/10 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-6 motion-safe:animate-[floatUp_0.25s_ease-out]">
        <h3 className="text-white font-semibold text-lg">Edit {monthLabel}</h3>
        <p className="text-white/50 text-xs mt-1">Changes are saved with a dated note so you can see what changed later.</p>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="edit-rent" className="text-white/70 text-sm block mb-1">Rent for the month</label>
            <input id="edit-rent" type="number" inputMode="decimal" min={0} step="0.01" value={rent} onChange={(e) => setRent(e.target.value)} className={inputClass} />
          </div>

          <div className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-3">
            <div>
              <label htmlFor="edit-water" className="text-white/70 text-sm block mb-1">Water bill (optional)</label>
              <input id="edit-water" type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" value={water} onChange={(e) => setWater(e.target.value)} className={inputClass} />
            </div>
            <div>
              <p className="text-white/70 text-sm mb-1">Period the bill covers (optional)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-from" className="text-white/50 text-xs block mb-1">From</label>
                  <input id="edit-from" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="edit-to" className="text-white/50 text-xs block mb-1">To</label>
                  <input id="edit-to" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={inputClass} />
                </div>
              </div>
              {!periodOrderOk && <p className="text-red-400 text-xs mt-1.5">The end date is before the start date.</p>}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-[#12A5A9] text-xs font-semibold cursor-pointer flex items-center gap-1.5 hover:underline">
                <FileTextIcon className="w-3.5 h-3.5" />
                {uploading ? 'Uploading…' : hasBillFile ? 'Replace bill file' : 'Attach bill file'}
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) onAttach(file)
                    e.target.value = ''
                  }}
                />
              </label>
              {billFileUrl && (
                <a href={billFileUrl} target="_blank" rel="noopener noreferrer" className="text-white/50 text-xs hover:text-white hover:underline">
                  View current →
                </a>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="edit-note" className="text-white/70 text-sm block mb-1">Reason (optional)</label>
            <input id="edit-note" type="text" maxLength={140} placeholder="e.g. Rent increase, repair credit" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          </div>

          {lateFee > 0 && <p className="text-white/50 text-xs">Includes a {money(lateFee)} late fee, which stays as it is.</p>}

          <div className={`rounded-xl bg-white/4 border border-white/8 px-4 py-3 text-sm ${outcome.tone}`} aria-live="polite">
            {outcome.text}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
          )}
        </div>

        <div className="flex items-center gap-3 mt-6">
          <RippleButton
            onClick={() => onSave({ rent: rentNum, water: waterNum, periodStart, periodEnd, note: note.trim() })}
            disabled={saving || uploading || !validNumbers || !periodOrderOk || !changed}
            className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </RippleButton>
          <button type="button" onClick={onClose} disabled={saving} className="text-white/50 hover:text-white text-sm transition disabled:opacity-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
