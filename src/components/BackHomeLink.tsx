'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useIsNativePlatform } from '@/lib/useIsNativePlatform'

// On the website, "← Back home" sending someone to the marketing landing
// page is normal and expected. Inside the native app it isn't — nobody
// who already has the app installed should get routed into the full
// marketing pitch from a legal/reference page, the same reasoning
// capacitor.config.ts gives for skipping that page on launch entirely.
// Native gets router.back() instead: a plain "go back to wherever I
// actually came from" (Profile, signup, wherever), which is what "back"
// means in every other app.
export function BackHomeLink({ className }: { className?: string }) {
  const router = useRouter()
  const isNative = useIsNativePlatform()

  if (isNative) {
    return (
      <button type="button" onClick={() => router.back()} className={className}>
        ← Back
      </button>
    )
  }

  return (
    <Link href="/" className={className}>
      ← Back home
    </Link>
  )
}
