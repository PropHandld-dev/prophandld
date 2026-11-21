'use client'

import { useState } from 'react'
import { BRAND_COLORS, dominantColorFromImage } from '@/lib/profileStyles'

// One brand color for the public profile: a curated swatch, the color of the
// uploaded logo, or any custom color. Saves on tap. Older saved styles
// (aurora, glacier...) still render; picking anything here replaces them.
export function BrandColorPicker({ value, logoUrl, onChange }: { value: string | null; logoUrl: string | null; onChange: (hex: string) => void }) {
  const [reading, setReading] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const current = value && value.startsWith('#') ? value.toUpperCase() : null
  const isPreset = !!current && BRAND_COLORS.some((c) => c.hex.toUpperCase() === current)

  const fromLogo = async () => {
    if (!logoUrl) return
    setReading(true)
    setNote(null)
    const hex = await dominantColorFromImage(logoUrl)
    setReading(false)
    if (hex) onChange(hex)
    else setNote("Couldn't read a color from that logo. Pick one instead.")
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Brand color">
        {BRAND_COLORS.map((c) => {
          const active = current === c.hex.toUpperCase()
          return (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={c.name}
              title={c.name}
              onClick={() => onChange(c.hex)}
              className={`w-9 h-9 rounded-full grid place-items-center transition ${active ? 'ring-2 ring-offset-2 ring-offset-[#0A0F1C] ring-white/80 scale-105' : 'hover:scale-105'}`}
              style={{ background: c.hex }}
            >
              {active && <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
            </button>
          )
        })}
        <label
          title="Custom color"
          className={`w-9 h-9 rounded-full grid place-items-center cursor-pointer border border-dashed transition ${current && !isPreset ? 'ring-2 ring-offset-2 ring-offset-[#0A0F1C] ring-white/80 border-transparent' : 'border-white/30 hover:border-white/60'}`}
          style={current && !isPreset ? { background: current } : undefined}
        >
          <span className="sr-only">Custom color</span>
          {!(current && !isPreset) && <span className="text-white/60 text-sm">+</span>}
          <input type="color" className="sr-only" value={current || '#0E9AA0'} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        </label>
      </div>
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <button
          type="button"
          onClick={fromLogo}
          disabled={!logoUrl || reading}
          className="text-xs font-semibold text-[#12A5A9] hover:underline disabled:text-white/30 disabled:no-underline"
        >
          {reading ? 'Reading your logo…' : 'Use my logo’s color'}
        </button>
        {!logoUrl && <span className="text-white/35 text-xs">Upload a logo first</span>}
      </div>
      {note && <p className="text-amber-300 text-xs mt-1">{note}</p>}
    </div>
  )
}
