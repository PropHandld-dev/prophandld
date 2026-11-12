'use client'

import { useEffect } from 'react'

// Exists specifically so reviewing Terms/Privacy during signup never
// navigates away from the signup form at all -- not even in a new tab.
// The obvious alternative, an iframe onto the real /terms or /privacy
// page, is blocked on purpose: this site sends X-Frame-Options: DENY
// site-wide (a real clickjacking defense), so it can't embed itself,
// and weakening that header for this would be a worse trade than the
// content duplication this avoids by importing the same *Content
// components the full legal pages themselves render.
export function LegalModal({
  title,
  lastUpdated,
  onClose,
  children,
}: {
  title: string
  lastUpdated: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-0 sm:px-4" onClick={onClose}>
      <div
        className="bg-[#0C1A2E] border border-white/10 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
          <div>
            <h2 className="text-white font-semibold">{title}</h2>
            <p className="text-white/40 text-xs">Last updated {lastUpdated}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition text-white/70 text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-6 space-y-10 text-white/60 text-sm leading-relaxed [&_h2]:text-white [&_h2]:font-semibold [&_h2]:text-lg [&_h2]:mb-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
          {children}
        </div>
        <div className="px-5 py-4 border-t border-white/8 shrink-0 text-right">
          <button
            type="button"
            onClick={onClose}
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90"
          >
            Done reviewing
          </button>
        </div>
      </div>
    </div>
  )
}
