'use client'

import { useLanguage, t } from '@/lib/i18n'
import { previewFirstMonth, type FirstMonthMode } from '@/lib/rentAutomation'

// "First month: prorate (recommended) or full", with the exact first charge
// shown before saving, so landlord and tenant see the same math.
export function FirstMonthChoice({ value, onChange, rent, leaseStart, dueDay }: { value: FirstMonthMode; onChange: (v: FirstMonthMode) => void; rent: number; leaseStart: string; dueDay: number }) {
  const lang = useLanguage()
  const loc = lang === 'es' ? 'es-US' : 'en-US'
  const money = (n: number) => n.toLocaleString(loc, { style: 'currency', currency: 'USD' })
  const p = previewFirstMonth(rent, leaseStart, dueDay, value)
  const opt = (v: FirstMonthMode, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === v}
      onClick={() => onChange(v)}
      className={`flex-1 text-left rounded-xl border px-3.5 py-2.5 text-sm transition ${value === v ? 'border-[#12A5A9] bg-[#12A5A9]/10 text-white' : 'border-white/10 bg-white/3 text-white/70 hover:border-white/25'}`}
    >
      {label}
    </button>
  )
  return (
    <div>
      <p className="text-white/70 text-sm mb-1.5">{t('firstMonthLabel', lang)}</p>
      <div role="radiogroup" aria-label={t('firstMonthLabel', lang)} className="flex flex-col sm:flex-row gap-2">
        {opt('prorate', t('firstMonthProrate', lang))}
        {opt('full', t('firstMonthFull', lang))}
      </div>
      {p ? (
        <p className="text-[#12A5A9] text-xs mt-2">
          {(p.prorated ? t('firstMonthPreview', lang) : t('firstMonthPreviewFull', lang))
            .replace('{math}', `${money(rent)} × ${p.daysOwed}/${p.daysInMonth} ${lang === 'es' ? 'días' : 'days'}`)
            .replace('{amount}', money(p.amount))
            .replace('{date}', p.dueDate.toLocaleDateString(loc, { month: 'short', day: 'numeric' }))}
        </p>
      ) : (
        <p className="text-white/40 text-xs mt-2">{t('firstMonthHint', lang)}</p>
      )}
    </div>
  )
}
