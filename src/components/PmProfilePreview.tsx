'use client'

import { resolveProfileStyle } from '@/lib/profileStyles'

const SPECIALTY: Record<string, string> = {
  single_family: 'Single-family',
  multifamily: 'Multifamily',
  short_term: 'Short-term',
  commercial: 'Commercial',
  hoa: 'HOA',
}

// A live, scaled-down version of the public profile landlords see, next to
// the editor, so every change shows immediately where it matters.
export function PmProfilePreview(p: {
  name: string
  pitch: string
  logoUrl: string | null
  coverUrl: string | null
  brandColor: string | null
  licenseNumber: string
  insured: boolean
  yearsInBusiness: number | ''
  specialties: string[]
  serviceZips: string
  pricingNote: string
  about: string
  live: boolean
}) {
  const look = resolveProfileStyle(p.brandColor)
  const initials = p.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const zips = p.serviceZips.split(/[\s,]+/).filter(Boolean)
  const badges = [
    p.licenseNumber.trim() && 'Licensed',
    p.insured && 'Insured',
    p.yearsInBusiness !== '' && Number(p.yearsInBusiness) > 0 && `${p.yearsInBusiness} yrs in business`,
  ].filter(Boolean) as string[]

  return (
    <div className="rounded-[22px] border border-white/10 bg-[#0C1A2E] overflow-hidden shadow-[0_30px_60px_-30px_rgba(0,0,0,0.7)]">
      <div className="relative h-24" style={p.coverUrl ? undefined : { background: look.gradient }}>
        {p.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.coverUrl} alt="" className="w-full h-full object-cover" />
        )}
        <span className={`absolute top-2.5 right-2.5 text-[10px] font-semibold rounded-full px-2 py-0.5 ${p.live ? 'bg-black/45 text-[#fff]' : 'bg-black/45 text-[#fff]/70'}`}>
          {p.live ? '● Live' : 'Hidden'}
        </span>
      </div>
      <div className="px-5 pb-5">
        <div className="relative z-10 -mt-8 mb-3 w-16 h-16 rounded-2xl p-[2px] shadow-lg" style={{ background: look.gradient }}>
          {p.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.logoUrl} alt="" className="w-full h-full rounded-[14px] object-cover bg-white" />
          ) : (
            <span className="w-full h-full rounded-[14px] bg-[#0C1A2E] grid place-items-center text-white font-bold">{initials}</span>
          )}
        </div>
        <p className="text-white font-bold text-lg leading-tight">{p.name}</p>
        <p className={`text-sm mt-1 leading-snug ${p.pitch.trim() ? 'text-white/70' : 'text-white/30 italic'}`}>{p.pitch.trim() || 'Your one-line pitch shows here'}</p>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {badges.map((b) => (
              <span key={b} className="text-[11px] font-semibold rounded-full px-2 py-0.5 border" style={{ color: look.stops[2], borderColor: `${look.accent}`, background: 'rgba(255,255,255,0.03)' }}>✓ {b}</span>
            ))}
          </div>
        )}
        {p.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {p.specialties.map((s) => <span key={s} className="text-[11px] text-white/70 bg-white/6 rounded-full px-2 py-0.5">{SPECIALTY[s] || s}</span>)}
          </div>
        )}
        {(zips.length > 0 || p.pricingNote.trim()) && (
          <div className="mt-3 space-y-1 text-[11px] text-white/50">
            {zips.length > 0 && <p>Serves {zips.slice(0, 4).join(', ')}{zips.length > 4 ? ` +${zips.length - 4} more` : ''}</p>}
            {p.pricingNote.trim() && <p>Pricing: {p.pricingNote}</p>}
          </div>
        )}
        {p.about.trim() && <p className="text-white/55 text-xs mt-3 line-clamp-3">{p.about}</p>}
        <span className="mt-4 block text-center text-sm font-semibold text-[#fff] rounded-xl py-2.5" style={{ background: look.accent }}>
          Request {p.name}
        </span>
      </div>
    </div>
  )
}
