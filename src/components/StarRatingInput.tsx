'use client'

import { useState } from 'react'

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
  const [hover, setHover] = useState<number | null>(null)
  const display = hover ?? value
  const starSize = size === 'sm' ? 'w-4 h-4' : 'w-6 h-6'

  return (
    <div>
      {label && <p className="text-white/70 text-sm mb-1">{label}</p>}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
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
