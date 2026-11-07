'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { initPostHog, posthog } from '@/lib/posthogClient'

// Captures a $pageview on first load and every client-side route change.
// PostHog records document.referrer automatically on each of these (as
// $referrer/$referring_domain) — that's what makes "how many people came
// from the Instagram/Facebook posts" answerable in the PostHog dashboard
// without anything extra. useSearchParams needs a Suspense boundary in
// the App Router, hence the wrapper below.
function PageviewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    initPostHog()
    const url = searchParams?.toString() ? `${pathname}?${searchParams.toString()}` : pathname
    posthog.capture('$pageview', { $current_url: window.location.origin + url })
  }, [pathname, searchParams])

  return null
}

export function PostHogPageview() {
  return (
    <Suspense fallback={null}>
      <PageviewTracker />
    </Suspense>
  )
}
