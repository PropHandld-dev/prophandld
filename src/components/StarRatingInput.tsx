'use client'

import { useRef, useState } from 'react'
import { useLanguage, t } from '@/lib/i18n'

function Star({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
      <path d="M12 2.5l2.9 6.2 6.6.7-5 4.6 1.4 6.6L12 17.5l-5.9 3.1 1.4-6.6-5-4.6 6.6-.7L12 2.5z" />
    </svg>
  )
}

export function StarRatingInput({
  value,
  onChange,
  readOnly = false,
  size = 'md',
  label,
}: {
  value: number
  onChange?: (n: number) => void
  readOnly?: boolean
  size?: 'sm' | 'md'
  label?: string
}) {
  const lang = useLanguage()
  const [hover, setHover] = useState<number | null>(null)
  const display = hover ?? value
  const starSize = size === 'sm' ? 'w-4 h-4' : 'w-6 h-6'
  const groupLabel = label || t('ratingLabel', lang)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  // Standard radio-group keyboard behavior (QA A11Y-03): one Tab stop per
  // group (the chosen star, or the first), arrow keys move and select.
  const onKey = (e: React.KeyboardEvent, n: number) => {
    if (readOnly) return
    const next = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? Math.min(5, n + 1) : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? Math.max(1, n - 1) : e.key === 'Home' ? 1 : e.key === 'End' ? 5 : null
    if (next == null) return
    e.preventDefault()
    onChange?.(next)
    refs.current[next - 1]?.focus()
  }
  const tabStop = value >= 1 && value <= 5 ? value : 1

  return (
    <div>
      {label && <p className="text-white/70 text-sm mb-1">{label}</p>}
      <div role="radiogroup" aria-label={groupLabel} className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            ref={(el) => { refs.current[n - 1] = el }}
            type="button"
            tabIndex={readOnly ? -1 : n === tabStop ? 0 : -1}
            onKeyDown={(e) => onKey(e, n)}
            role="radio"
            aria-checked={n === value}
            aria-label={`${groupLabel}: ${n} ${t('ofWord', lang)} 5`}
            disabled={readOnly}
            onClick={() => onChange?.(n)}
            onMouseEnter={() => !readOnly && setHover(n)}
            onMouseLeave={() => !readOnly && setHover(null)}
            className={readOnly ? 'cursor-default' : 'cursor-pointer'}
          >
            <Star
              filled={n <= display}
              className={`${starSize} transition-colors ${n <= display ? 'text-[#12A5A9]' : 'text-white/20'}`}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
