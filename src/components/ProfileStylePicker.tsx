'use client'

import { useState } from 'react'
import { PROFILE_STYLE_KEYS, PROFILE_STYLES, resolveProfileStyle, dominantColorFromImage } from '@/lib/profileStyles'

// Pick a profile look: curated gradient styles, or one generated from the
// uploaded logo. Saves on tap; the public page updates immediately.
export function ProfileStylePicker({
  value,
  logoUrl,
  onChange,
}: {
  value: string | null
  logoUrl: string | null
  onChange: (next: string) => void
}) {
  const [matching, setMatching] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const current = value || 'aurora'
  const fromLogo = !!value && value.startsWith('#')

  const matchLogo = async () => {
    if (!logoUrl) return
    setMatching(true)
    setNote(null)
    const hex = await dominantColorFromImage(logoUrl)
    setMatching(false)
    if (hex) onChange(hex)
    else setNote("Couldn't read colors from that logo. Pick a style instead.")
  }

  const swatch = (gradient: string, stops: string[]) => (
    <span
      aria-hidden
      className="block h-14 w-full rounded-xl overflow-hidden relative"
      style={{ background: `radial-gradient(120% 120% at 0% 0%, ${stops[2]} 0%, transparent 55%), ${gradient}` }}
    >
      <span className="absolute inset-0 bg-[radial-gradient(80%_80%_at_100%_100%,rgba(255,255,255,0.35),transparent_60%)]" />
    </span>
  )

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
        {PROFILE_STYLE_KEYS.map((key) => {
          const s = resolveProfileStyle(key)
          const active = current === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-pressed={active}
              className={`text-left rounded-2xl p-1.5 border transition ${active ? 'border-[#12A5A9] ring-2 ring-[#12A5A9]/40' : 'border-white/10 hover:border-white/25'}`}
            >
              {swatch(s.gradient, s.stops)}
              <span className="block text-xs font-semibold text-white mt-1.5 px-1">{PROFILE_STYLES[key].name}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={matchLogo}
          disabled={!logoUrl || matching}
          aria-pressed={fromLogo}
          className={`text-left rounded-2xl p-1.5 border transition disabled:opacity-40 ${fromLogo ? 'border-[#12A5A9] ring-2 ring-[#12A5A9]/40' : 'border-dashed border-white/20 hover:border-white/35'}`}
        >
          {fromLogo ? (
            swatch(resolveProfileStyle(value).gradient, resolveProfileStyle(value).stops)
          ) : (
            <span className="h-14 w-full rounded-xl bg-white/5 flex items-center justify-center text-white/50 text-lg">✦</span>
          )}
          <span className="block text-xs font-semibold text-white mt-1.5 px-1">{matching ? 'Reading logo…' : 'Match my logo'}</span>
        </button>
      </div>
      <p className="text-white/40 text-xs mt-2">
        {logoUrl ? 'Sets your profile header, buttons and team colors.' : 'Upload a logo to generate a style from its colors.'}
      </p>
      {note && <p className="text-yellow-400 text-xs mt-1">{note}</p>}
    </div>
  )
}
