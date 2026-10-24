'use client'

import { useEffect, useState } from 'react'

// Starts false (matches server render) and flips true once Capacitor
// confirms this is the iOS/Android wrapper, not a browser tab. Dynamic
// import so @capacitor/core never reaches the web bundle for the vast
// majority of visitors who are just on the website.
export function useIsNativePlatform(): boolean {
  const [isNative, setIsNative] = useState(false)

  useEffect(() => {
    let active = true
    import('@capacitor/core')
      .then(({ Capacitor }) => {
        if (active && Capacitor.isNativePlatform()) setIsNative(true)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  return isNative
}
