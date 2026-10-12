'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const LAST_ACTIVE_KEY = 'prophandld_last_active'
// 60 days: long enough that a renter who only opens the app once a month
// for rent (the least frequent normal use case in this app) never gets
// caught by it, short enough to actually cut off a genuinely forgotten,
// long-dormant session — a lost/replaced phone, a shared or public
// computer nobody came back to, an account someone stopped using. Tune
// here if that balance should shift; it's the only number that matters
// in this part of the file. This check runs once, on mount — it answers
// "has the app not been opened at all in a long time," not "has someone
// walked away from an open tab" (that's IDLE_THRESHOLD_MS below, a
// deliberately separate and much shorter mechanism).
const DORMANT_THRESHOLD_MS = 60 * 24 * 60 * 60 * 1000

// A real idle timeout — zero interaction (no tap, click, scroll or
// keypress) while the app is actively open. Added specifically for the
// "someone picks up my unlocked phone/laptop right now" threat, which the
// dormant-session check above doesn't cover at all (that one only looks at
// time between app opens, not time spent sitting idle within one open
// session). 20 minutes, picked deliberately over a banking-app-style 5:
// this app gets used in bursts with real interruptions built in — stepping
// away to take a photo for a job report, 15 minutes of actual physical
// work between checking a job, a phone call — and a 5-minute timeout would
// force a re-login through completely normal use, which for an app whose
// explicit goal is being usable by non-technical people does more harm
// than good. The single scariest version of this threat — someone using a
// grabbed, still-logged-in session to redirect a payout bank account — is
// already closed independent of any timeout: changing a payout account
// requires re-entering the password regardless of session freshness (see
// DwollaConnectCard's reauth step).
const IDLE_THRESHOLD_MS = 20 * 60 * 1000
const IDLE_CHECK_INTERVAL_MS = 30 * 1000
const INTERACTION_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const

function forceSignOut(reason: 'inactive' | 'idle') {
  supabase.auth.signOut().finally(() => {
    window.location.href = `/login?reason=${reason}`
  })
}

// Rendered as a sibling of {children} in each role's layout.tsx (a Server
// Component, where requireRole() already does the real, unbypassable
// role check) — this is a client-side addition alongside it, not a
// replacement for it. Signs out through the same client-side
// supabase.auth.signOut() every other sign-out in this app already uses
// (see profile/page.tsx) — a Server Component can't reliably clear
// session cookies itself in Next.js, so this has to run in the browser.
export function InactivityGuard() {
  const lastInteractionRef = useRef<number>(Date.now())

  // The dormant-session check: per-device localStorage, not a server
  // column — zero extra network round trip on every page load (this app's
  // stated top priority is no added lag), at the cost of resetting if
  // someone clears site data. Acceptable for what this defends against
  // (a forgotten dormant session), not a hard security boundary against
  // someone actively trying to evade it.
  useEffect(() => {
    let lastActive: number | null = null
    try {
      const stored = localStorage.getItem(LAST_ACTIVE_KEY)
      lastActive = stored ? Number(stored) : null
    } catch {
      // Private browsing / blocked storage — nothing to compare against,
      // so just skip the check this load rather than guessing.
    }

    if (lastActive && Date.now() - lastActive > DORMANT_THRESHOLD_MS) {
      forceSignOut('inactive')
      return
    }

    try {
      localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()))
    } catch {}
  }, [])

  // The idle-while-open check: in-memory only, resets every time this
  // component remounts (a real page navigation), which is itself a sign
  // of life, so that's correct. A mobile tab backgrounded for a while
  // throttles setInterval unreliably, so the check also runs the instant
  // the tab regains focus/visibility, not just on the interval — without
  // that, a phone put to sleep for an hour and woken up could show one
  // more stale interval tick before catching up.
  useEffect(() => {
    const markActive = () => { lastInteractionRef.current = Date.now() }
    const checkIdle = () => {
      if (Date.now() - lastInteractionRef.current > IDLE_THRESHOLD_MS) {
        forceSignOut('idle')
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkIdle()
    }

    INTERACTION_EVENTS.forEach((evt) => window.addEventListener(evt, markActive, { passive: true }))
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    const interval = setInterval(checkIdle, IDLE_CHECK_INTERVAL_MS)

    return () => {
      INTERACTION_EVENTS.forEach((evt) => window.removeEventListener(evt, markActive))
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      clearInterval(interval)
    }
  }, [])

  return null
}
