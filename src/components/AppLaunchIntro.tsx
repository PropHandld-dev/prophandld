'use client'

import { useEffect, useState } from 'react'
import { useIsNativePlatform } from '@/lib/useIsNativePlatform'
import { Logo } from '@/components/Logo'

// Capacitor's own SplashScreen plugin only ever shows one static image —
// there's no way to animate within it. The actual motion (a Netflix-style
// branded moment on launch) has to be the web app's own first frame
// instead: the native splash hides the instant this mounts, handing off
// to this logo entrance animation, which then fades itself out into the
// real app. A no-op on the website — isNative only flips true inside the
// actual wrapped iOS/Android app, never a browser tab, and this renders
// nothing until that's confirmed.
//
// Once per cold launch, not once per page: a module-level flag, not
// sessionStorage, which would persist across the actual app being force-
// quit and relaunched (when the whole JS context, and this flag with it,
// is gone anyway) — sessionStorage could survive a background/foreground
// cycle, and nobody wants this replaying every time they switch back to
// the app from their Home Screen.
let hasPlayedThisLaunch = false

export function AppLaunchIntro() {
  const isNative = useIsNativePlatform()
  const [phase, setPhase] = useState<'in' | 'hold' | 'out' | 'done'>('in')

  useEffect(() => {
    if (!isNative || hasPlayedThisLaunch) {
      setPhase('done')
      return
    }
    hasPlayedThisLaunch = true

    import('@capacitor/splash-screen')
      .then(({ SplashScreen }) => SplashScreen.hide())
      .catch(() => {})

    const toHold = setTimeout(() => setPhase('hold'), 650)
    const toOut = setTimeout(() => setPhase('out'), 1700)
    const toDone = setTimeout(() => setPhase('done'), 2050)
    return () => {
      clearTimeout(toHold)
      clearTimeout(toOut)
      clearTimeout(toDone)
    }
  }, [isNative])

  if (phase === 'done') return null

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[#0C1A2E] transition-opacity duration-300 ${
        phase === 'out' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Brought up to the same recipe as the web landing's own launch
          moment (LandingLaunchIntro) -- this used to be just the bare
          logo, a weaker version of the "Netflix-style branded moment"
          this component's own original comment describes. */}
      <div className="relative">
        <div
          className={`absolute inset-0 -m-8 rounded-full bg-[#12A5A9]/30 blur-2xl transition-all duration-700 ease-out ${
            phase === 'in' ? 'opacity-0 scale-50' : 'opacity-100 scale-100'
          }`}
        />
        <Logo
          className={`relative w-16 h-16 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            phase === 'in' ? 'opacity-0 scale-50 -rotate-12' : 'opacity-100 scale-100 rotate-0'
          }`}
        />
      </div>
      <span
        className={`font-display text-white font-bold text-3xl tracking-tight transition-all duration-500 delay-100 ease-out ${
          phase === 'in' ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'
        }`}
      >
        Prophandld
      </span>
    </div>
  )
}
