'use client'

import { useEffect, useRef, useState } from 'react'
import {
  BuildingIcon, DollarSignIcon, ClipboardListIcon, ShieldIcon,
  ReceiptIcon, MessageCircleIcon, WrenchIcon, LockIcon,
} from '@/components/icons'

type Role = 'landlord' | 'contractor'
type Slide = { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }

const SLIDES: Record<Role, Slide[]> = {
  landlord: [
    { icon: BuildingIcon, title: 'Every property, one dashboard', desc: 'Properties, units, leases, and tenants, all tracked in one place. No more juggling spreadsheets.' },
    { icon: LockIcon, title: 'Sealed bidding', desc: "Contractors bid without seeing each other's numbers. Real competition, not inflated quotes." },
    { icon: DollarSignIcon, title: 'Rent that tracks itself', desc: 'Auto-generated monthly rent, automatic reminders and late flags, paid online by bank transfer or debit card.' },
    { icon: ClipboardListIcon, title: 'Compliance, on autopilot', desc: 'Add an expiry date once. Get warned weeks before a license or certificate lapses, not the day an inspector shows up.' },
    { icon: ReceiptIcon, title: 'Financial reports, built for tax time', desc: 'What you collected and paid out, by property. Filter by date range, export to CSV or a clean branded PDF.' },
    { icon: MessageCircleIcon, title: 'Direct messaging', desc: 'Message a tenant or a contractor you trust directly, job or no job. No phone numbers exchanged.' },
  ],
  contractor: [
    { icon: WrenchIcon, title: 'Free leads. No cut. Ever.', desc: 'Real jobs near you, sent straight to your phone for your trade. No signup fee, no monthly fee, no cut of your bid.' },
    { icon: LockIcon, title: 'Picked on merit, not lowballing', desc: 'Submit a sealed bid. Nobody undercuts you, because nobody can see your price.' },
    { icon: DollarSignIcon, title: "Get paid the moment you're approved", desc: 'Payment lands directly, by bank transfer or debit card, the instant a landlord approves your finished work.' },
    { icon: ShieldIcon, title: 'Verified credentials, shown automatically', desc: "Submit your license and insurance once. Landlords see you're verified before they ever pick a bid." },
    { icon: ReceiptIcon, title: 'Earnings & tax reports', desc: 'Every paid job with a receipt. Filter by date range and export your earnings for tax time.' },
  ],
}

const AUTO_ADVANCE_MS = 4500

// A role-switchable "feature tour" — deeper than the single dashboard
// mockup RoleShowcase (further up the page) gives each role, this walks
// through several distinct, already-shipped capabilities one at a time,
// the way a demo reel would. Replaces the old static 4-card Features grid,
// which only ever showed one fixed set of cards regardless of who was
// reading them.
export function FeatureTourCarousel() {
  const [role, setRole] = useState<Role>('landlord')
  const [index, setIndex] = useState(0)
  const [autoplay, setAutoplay] = useState(true)
  const touchStartX = useRef<number | null>(null)

  const slides = SLIDES[role]

  useEffect(() => {
    if (!autoplay) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length)
    }, AUTO_ADVANCE_MS)
    return () => clearInterval(id)
  }, [autoplay, slides.length])

  const goTo = (i: number) => {
    setAutoplay(false)
    setIndex(((i % slides.length) + slides.length) % slides.length)
  }
  const handleRoleChange = (r: Role) => {
    setAutoplay(false)
    setRole(r)
    setIndex(0)
  }

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(delta) > 40) goTo(index + (delta < 0 ? 1 : -1))
    touchStartX.current = null
  }

  const slide = slides[index]
  const Icon = slide.icon

  return (
    <div>
      <div className="flex items-center justify-center gap-2 mb-10">
        {(['landlord', 'contractor'] as Role[]).map((r) => (
          <button
            key={r}
            onClick={() => handleRoleChange(r)}
            className={
              r === role
                ? 'text-xs sm:text-sm font-semibold px-4 py-2 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white transition'
                : 'text-xs sm:text-sm font-semibold px-4 py-2 rounded-full bg-white/5 text-white/50 hover:bg-white/8 hover:text-white/80 transition'
            }
          >
            {r === 'landlord' ? 'For landlords' : 'For contractors'}
          </button>
        ))}
      </div>

      <div
        className="relative max-w-2xl mx-auto"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <button
          aria-label="Previous feature"
          onClick={() => goTo(index - 1)}
          className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-10 h-10 rounded-full bg-white/5 border border-white/10 items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition z-10"
        >
          ←
        </button>
        <button
          aria-label="Next feature"
          onClick={() => goTo(index + 1)}
          className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-10 h-10 rounded-full bg-white/5 border border-white/10 items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition z-10"
        >
          →
        </button>

        <div key={`${role}-${index}`} className="bg-white/3 border border-white/8 rounded-3xl px-8 py-12 sm:px-14 sm:py-16 text-center motion-safe:animate-[fadeIn_0.35s_ease-out]">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center mx-auto mb-6">
            <Icon className="w-7 h-7 text-[#12A5A9]" />
          </div>
          <h3 className="text-white font-bold text-xl sm:text-2xl mb-3 text-balance">{slide.title}</h3>
          <p className="text-white/55 text-sm sm:text-base leading-relaxed max-w-lg mx-auto">{slide.desc}</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 mt-6">
        {slides.map((_, i) => (
          <button
            key={i}
            aria-label={`Go to feature ${i + 1}`}
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-[#12A5A9]' : 'w-1.5 bg-white/15 hover:bg-white/30'}`}
          />
        ))}
      </div>
    </div>
  )
}
