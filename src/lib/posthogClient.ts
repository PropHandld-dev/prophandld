import posthog from 'posthog-js'

let initialized = false

// NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN/HOST already existed as env vars, and a
// server-side client (posthog-server.ts) was already built against them,
// but nothing ever actually called it, and there was no client-side init
// at all — meaning no pageviews, no referrers, nothing was ever actually
// being recorded despite looking configured. capture_pageview is off here
// because PostHogPageview below captures it manually on every App Router
// navigation (posthog-js's automatic pageview capture doesn't reliably see
// client-side route changes in the App Router).
export function initPostHog() {
  if (initialized || typeof window === 'undefined') return
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  if (!token) return
  posthog.init(token, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    capture_pageview: false,
    person_profiles: 'identified_only',
  })
  initialized = true
}

export { posthog }
