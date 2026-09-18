'use client'

import { useEffect, useState, useCallback } from 'react'

export type TourStep = {
  target: string
  title: string
  body: string
}

function getRect(selector: string): DOMRect | null {
  const el = document.querySelector(selector)
  if (!el) return null
  return el.getBoundingClientRect()
}

export function ProductTour({
  steps,
  onDone,
  onNeverAskAgain,
}: {
  steps: TourStep[]
  onDone: () => void
  onNeverAskAgain?: () => void
}) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const measure = useCallback(() => {
    const step = steps[index]
    if (!step) return
    const el = document.querySelector(step.target)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Give the smooth-scroll a beat to land before measuring.
    window.setTimeout(() => setRect(getRect(step.target)), 220)
  }, [index, steps])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  const next = () => {
    if (index === steps.length - 1) {
      onDone()
    } else {
      setIndex((i) => i + 1)
    }
  }
  const back = () => setIndex((i) => Math.max(0, i - 1))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  const step = steps[index]
  if (!step) return null

  const pad = 8
  const box = rect
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null

  // Position the card below the target if there's room, otherwise above;
  // clamp horizontally so it never runs off a narrow (phone-width) viewport.
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 400
  const cardWidth = Math.min(340, viewportW - 32)
  let cardTop = 0
  let cardLeft = 16
  if (box) {
    const spaceBelow = viewportH - (box.top + box.height)
    const placeBelow = spaceBelow > 190 || box.top < 190
    cardTop = placeBelow ? box.top + box.height + 14 : Math.max(16, box.top - 14 - 210)
    cardLeft = Math.min(Math.max(16, box.left), viewportW - cardWidth - 16)
  } else {
    cardTop = viewportH / 2 - 100
    cardLeft = viewportW / 2 - cardWidth / 2
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* Spotlight — four dimmed panels around the cutout, or one full-dim panel while measuring */}
      {box ? (
        <>
          <div className="fixed bg-black/70 transition-all duration-300" style={{ top: 0, left: 0, right: 0, height: Math.max(0, box.top) }} />
          <div className="fixed bg-black/70 transition-all duration-300" style={{ top: box.top + box.height, left: 0, right: 0, bottom: 0 }} />
          <div className="fixed bg-black/70 transition-all duration-300" style={{ top: box.top, left: 0, width: Math.max(0, box.left), height: box.height }} />
          <div className="fixed bg-black/70 transition-all duration-300" style={{ top: box.top, left: box.left + box.width, right: 0, height: box.height }} />
          <div
            className="fixed rounded-xl ring-2 ring-[#12A5A9] pointer-events-none transition-all duration-300"
            style={{ top: box.top, left: box.left, width: box.width, height: box.height, boxShadow: '0 0 0 4px rgba(18,165,169,0.2)' }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/70" />
      )}

      <div
        className="fixed bg-[#0F2138] border border-white/10 rounded-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] p-5 transition-all duration-300"
        style={{ top: cardTop, left: cardLeft, width: cardWidth }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9]' : 'w-1.5 bg-white/15'}`}
              />
            ))}
          </div>
          <button onClick={onDone} aria-label="Close tour" className="text-white/30 hover:text-white text-sm leading-none transition">
            ×
          </button>
        </div>
        <h3 className="text-white font-semibold text-base mb-1.5">{step.title}</h3>
        <p className="text-white/60 text-sm leading-relaxed">{step.body}</p>
        <div className="flex items-center justify-between mt-5 gap-2">
          <button
            onClick={back}
            disabled={index === 0}
            className="text-white/40 hover:text-white text-xs font-semibold disabled:opacity-0 disabled:pointer-events-none transition shrink-0"
          >
            ← Back
          </button>
          <div className="flex items-center gap-3 shrink-0">
            {onNeverAskAgain && (
              <button
                onClick={onNeverAskAgain}
                className="text-white/35 hover:text-white/60 text-[11px] font-medium underline underline-offset-2 transition whitespace-nowrap"
              >
                Never show again
              </button>
            )}
            <button
              onClick={onDone}
              className="text-white/50 hover:text-white text-xs font-semibold transition whitespace-nowrap"
            >
              Skip
            </button>
            <button
              onClick={next}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold rounded-full px-4 py-2 hover:opacity-90 transition shrink-0"
            >
              {index === steps.length - 1 ? "Let's go" : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
