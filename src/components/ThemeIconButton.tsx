'use client'

import { useEffect, useState } from 'react'
import { applyTheme, getThemeChoice, type ThemeChoice } from '@/lib/theme'

const NEXT: Record<ThemeChoice, ThemeChoice> = { dark: 'light', light: 'system', system: 'dark' }
const LABEL: Record<ThemeChoice, string> = { dark: 'Dark', light: 'Light', system: 'Auto' }

function Icon({ choice }: { choice: ThemeChoice }) {
  if (choice === 'light')
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  if (choice === 'dark')
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    )
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </svg>
  )
}

// One tap cycles Dark → Light → Auto. `withLabel` shows the current name
// next to the icon (used in the phone menu).
export function ThemeIconButton({ withLabel = false, className = '' }: { withLabel?: boolean; className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>('dark')
  useEffect(() => setChoice(getThemeChoice()), [])
  const next = NEXT[choice]
  return (
    <button
      type="button"
      onClick={() => { applyTheme(next); setChoice(next) }}
      aria-label={`Appearance: ${LABEL[choice]}. Switch to ${LABEL[next]}`}
      title={`Appearance: ${LABEL[choice]}`}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-white/15 text-white/70 hover:text-white hover:border-white/30 transition ${withLabel ? 'px-3 h-9 text-sm font-medium' : 'w-9 h-9'} ${className}`}
    >
      <Icon choice={choice} />
      {withLabel && <span>Appearance: {LABEL[choice]}</span>}
    </button>
  )
}
