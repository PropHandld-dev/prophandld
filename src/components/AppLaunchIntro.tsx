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

    const toHold = setTimeout(() => setPhase('hold'), 550)
    const toOut = setTimeout(() => setPhase('out'), 950)
    const toDone = setTimeout(() => setPhase('done'), 1300)
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
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[#0C1A2E] transition-opacity duration-300 ${
        phase === 'out' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <Logo
        className={`w-20 h-20 transition-all duration-500 ease-out ${
          phase === 'in' ? 'opacity-0 scale-75' : 'opacity-100 scale-100'
        }`}
      />
    </div>
  )
}
