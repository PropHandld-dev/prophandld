'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPinIcon } from '@/components/icons'

// A web app can't ask the phone "open this in whatever maps app you prefer"
// the way a native app can — there's no such setting to read. The honest
// middle ground: offer both, so the person picks in one tap instead of us
// guessing wrong. Apple Maps is only offered on an Apple device, since its
// link is a poor experience (or just the Apple Maps website) everywhere else.
function isApplePlatform() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
}

export function AddressLink({ address, city, className = '' }: { address: string; city?: string | null; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [showApple, setShowApple] = useState(false)

  useEffect(() => setShowApple(isApplePlatform()), [])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const full = [address, city].filter(Boolean).join(', ')
  const q = encodeURIComponent(full)
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${q}`
  const appleUrl = `https://maps.apple.com/?q=${q}`

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-left hover:text-[#12A5A9] transition underline decoration-dotted underline-offset-2"
      >
        <MapPinIcon className="w-3.5 h-3.5 shrink-0" />
        {full}
      </button>
      {open && (
        <div className="absolute z-20 mt-1.5 left-0 bg-[#0F2138] border border-white/10 rounded-xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)] overflow-hidden min-w-[180px]">
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-white hover:bg-white/5 transition"
          >
            Open in Google Maps
          </a>
          {showApple && (
            <a
              href={appleUrl}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-white hover:bg-white/5 transition border-t border-white/8"
            >
              Open in Apple Maps
            </a>
          )}
        </div>
      )}
    </div>
  )
}
