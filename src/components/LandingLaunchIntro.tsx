'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/Logo'
import { useIsNativePlatform } from '@/lib/useIsNativePlatform'

// The web counterpart to AppLaunchIntro's native splash handoff — a first-
// visit moment for the marketing site itself, not just the installed app.
// Purely decorative: a fixed overlay on top of the real page, which is
// already rendering underneath it the whole time, so this never delays or
// hides anything from a crawler, never shifts layout (fixed positioning,
// out of flow), and never affects the real Largest Contentful Paint
// element's own render time — it only affects how soon a human's eyes can
// see it.
//
// Landing page only (same pathname gate CursorGlow already uses), skipped
// entirely for prefers-reduced-motion, and once per tab session via a
// module-level flag — reloading the page is a fresh "cold open" and is
// expected to replay it, same reasoning as the native version; navigating
// away and back within the same tab should not.
let hasPlayedThisSession = false

export function LandingLaunchIntro() {
  const pathname = usePathname()
  const isNative = useIsNativePlatform()
  // AppLaunchIntro already owns the native case — skip here even if the
  // wrapped app's first route ever happens to be '/', so the two never
  // stack.
  const isLanding = pathname === '/' && !isNative
  const [phase, setPhase] = useState<'in' | 'hold' | 'out' | 'done'>('in')

  useEffect(() => {
    if (!isLanding || hasPlayedThisSession) {
      setPhase('done')
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      hasPlayedThisSession = true
      setPhase('done')
      return
    }
    hasPlayedThisSession = true

    const toHold = setTimeout(() => setPhase('hold'), 700)
    const toOut = setTimeout(() => setPhase('out'), 2500)
    const toDone = setTimeout(() => setPhase('done'), 2850)
    return () => {
      clearTimeout(toHold)
      clearTimeout(toOut)
      clearTimeout(toDone)
    }
  }, [isLanding])

  if (phase === 'done') return null

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-[#0C1A2E] transition-opacity duration-300 ${
        phase === 'out' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="relative flex items-center gap-4">
        {/* Two overlapping glows instead of one static blur -- the outer
            ring expands past the logo's own fade-in, reading as energy
            arriving rather than just appearing, and drifts slowly even
            at rest so the hold phase doesn't go completely static. */}
        <div
          className={`absolute inset-0 -m-14 rounded-full bg-[#0A7B7E]/20 blur-3xl transition-all duration-[900ms] ease-out motion-safe:animate-[drift_6s_ease-in-out_infinite] ${
            phase === 'in' ? 'opacity-0 scale-[0.3]' : 'opacity-100 scale-100'
          }`}
        />
        <div
          className={`absolute inset-0 -m-8 rounded-full bg-[#12A5A9]/30 blur-2xl transition-all duration-700 ease-out ${
            phase === 'in' ? 'opacity-0 scale-50' : 'opacity-100 scale-100'
          }`}
        />
        {/* Spring overshoot (scale past 1 before settling) instead of a
            plain ease-out fade -- the cubic-bezier here is the standard
            "pop" curve, reads as something arriving with a bit of
            weight rather than just fading up. */}
        <Logo
          className={`relative w-20 h-20 sm:w-28 sm:h-28 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            phase === 'in' ? 'opacity-0 scale-50 -rotate-12' : 'opacity-100 scale-100 rotate-0'
          }`}
        />
        <span
          className={`relative font-display text-white font-bold text-5xl sm:text-7xl tracking-tight transition-all duration-700 delay-75 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            phase === 'in' ? 'opacity-0 scale-50 translate-y-2' : 'opacity-100 scale-100 translate-y-0'
          }`}
        >
          Prophandld
        </span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <p
          className={`text-white/70 text-lg sm:text-xl font-medium tracking-wide transition-all duration-500 delay-300 ease-out ${
            phase === 'in' ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'
          }`}
        >
          Your Property. Handled.
        </p>
        <div
          className={`h-[2px] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] transition-all duration-500 delay-500 ease-out ${
            phase === 'in' ? 'w-0' : 'w-20'
          }`}
        />
      </div>
    </div>
  )
}
