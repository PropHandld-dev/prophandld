'use client'

import { useEffect, useState } from 'react'
import { applyTheme, getThemeChoice, type ThemeChoice } from '@/lib/theme'
import { useLanguage } from '@/lib/i18n'

const OPTIONS: { key: ThemeChoice; en: string; es: string; icon: string }[] = [
  { key: 'dark', en: 'Dark', es: 'Oscuro', icon: '☾' },
  { key: 'light', en: 'Light', es: 'Claro', icon: '☀' },
  { key: 'system', en: 'Auto', es: 'Auto', icon: '◐' },
]

export function AppearanceToggle({ className = '' }: { className?: string }) {
  const lang = useLanguage()
  const [choice, setChoice] = useState<ThemeChoice>('dark')

  useEffect(() => {
    setChoice(getThemeChoice())
    if (getThemeChoice() !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [choice])

  return (
    <div className={className}>
      <div role="radiogroup" aria-label={lang === 'es' ? 'Apariencia' : 'Appearance'} className="grid grid-cols-3 gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
        {OPTIONS.map((o) => {
          const active = choice === o.key
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => { applyTheme(o.key); setChoice(o.key) }}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition ${
                active ? 'bg-[#12A5A9] text-white shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <span aria-hidden>{o.icon}</span>
              {lang === 'es' ? o.es : o.en}
            </button>
          )
        })}
      </div>
      <p className="text-white/40 text-xs mt-2">
        {lang === 'es' ? 'Auto sigue la configuración de tu teléfono o computadora.' : 'Auto follows your phone or computer setting.'}
      </p>
    </div>
  )
}
