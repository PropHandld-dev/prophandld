'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// Exported so any other code path that signs someone out directly (Profile's
// manual sign-out/delete-account, which don't go through forceSignOut below)
// can clear it too — a real gap found in a pre-launch audit: without this,
// signing out manually, then logging back in within the stale window, got
// immediately bounced back out with a confusing "signed out for inactivity"
// message, since this component mounts fresh on the dashboard and reads the
// same pre-logout timestamp.
export const LAST_ACTIVE_KEY = 'prophandld_last_active'
// 60 days: an absolute backstop for a genuinely forgotten, long-dormant
// session — a lost/replaced phone, a shared or public computer nobody
// came back to, an account someone stopped using — independent of the
// interim 20-minute persisted check below ever running at all (e.g. this
// localStorage key was somehow never written). In the normal case the
// 20-minute check below is stricter and catches everything this would,
// so this mostly exists as a safety net, not the primary mechanism.
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
// already closed independent of any timeout: changing a Zelle/Venmo/Cash
// App payout handle requires re-entering the password regardless of
// session freshness (see ZelleVenmoCashAppCard's reauth step) — Stripe
// Connect bank details are changed entirely inside Stripe's own hosted
// dashboard, governed by Stripe's own security, not this app's.
const IDLE_THRESHOLD_MS = 20 * 60 * 1000
const IDLE_CHECK_INTERVAL_MS = 30 * 1000
const INTERACTION_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const

// Interim fix (until the Supabase plan upgrade brings a real server-side
// session timeout — see auth.sessions.inactivity_timeout, Pro-plan-gated,
// not available on the current tier): the idle check above only runs
// while the tab/app is actually open in memory — closing it before 20
// minutes of idle time elapses resets the timer entirely, so someone who
// closes the app and reopens it a day later was previously caught by
// neither this check nor the 60-day dormant one. Confirmed as a real gap,
// not a false alarm, via a live account that stayed signed in overnight.
// This persists the same 20-minute threshold to localStorage so it's also
// checked on mount, not only via the in-memory interval — closing the app
// no longer resets the clock. This is a conscious, deliberate tightening
// (every normal "closed the app, came back later" gap over 20 minutes now
// forces a re-login, not just a genuinely-idle-while-open one) accepted
// as a stopgap until the real server-side fix lands; not a bypass-proof
// fix on its own, since it's still enforced client-side only (clearing
// site data resets it, same caveat the dormant check above already has).

function forceSignOut(reason: 'inactive' | 'idle') {
  // Real bug this exact omission caused: without clearing this, the stale
  // timestamp sits in localStorage past the sign-out, so the moment the
  // person signs back in and lands on a dashboard, InactivityGuard mounts
  // fresh, reads that same still-too-old timestamp, and immediately force
  // signs them out again — an unbreakable loop on that device, since
  // nothing before this fix ever gave the check a reason to see anything
  // but the original stale value. Clearing it here means the next mount
  // (right after a fresh sign-in) sees no stored value, skips the check,
  // and writes a clean timestamp instead.
  try {
    localStorage.removeItem(LAST_ACTIVE_KEY)
  } catch {}
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

  // Supabase's browser client syncs session state across same-origin tabs
  // (storage events) — switching linked profiles in one tab (see
  // profileSwitch.ts) silently flips the underlying session in every OTHER
  // open tab too, without those tabs' already-rendered React state having
  // any idea it happened. A form submitted or button clicked in a stale
  // tab after that point would run under the NEW account's identity
  // against UI that still looks like the old one — a real identity
  // mismatch, not just a cosmetic staleness bug, and exactly the kind of
  // "account A's data next to account B's session" gap a pre-launch audit
  // flagged. The tab that actually performs the switch already does a
  // hard navigation (window.location.href) and is unaffected; this is for
  // every OTHER tab watching the same browser's session. A full reload is
  // the simplest correct fix — whatever page loads next re-runs its own
  // server-side role check against the new session from scratch.
  useEffect(() => {
    let knownUserId: string | null = null
    let initialized = false

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user?.id ?? null
      // onAuthStateChange fires once immediately on subscribe with the
      // current session — that first call is just the baseline, nothing to
      // compare against yet.
      if (!initialized) {
        knownUserId = nextUserId
        initialized = true
        return
      }
      if (event === 'SIGNED_OUT') {
        if (knownUserId !== null) window.location.href = '/login'
        knownUserId = null
        return
      }
      if (nextUserId && knownUserId && nextUserId !== knownUserId) {
        window.location.reload()
        return
      }
      knownUserId = nextUserId
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Per-device localStorage, not a server column — zero extra network
  // round trip on every page load (this app's stated top priority is no
  // added lag), at the cost of resetting if someone clears site data.
  // Acceptable for what this defends against (a forgotten/closed-and-
  // reopened session), not a hard security boundary against someone
  // actively trying to evade it.
  useEffect(() => {
    let lastActive: number | null = null
    try {
      const stored = localStorage.getItem(LAST_ACTIVE_KEY)
      lastActive = stored ? Number(stored) : null
    } catch {
      // Private browsing / blocked storage — nothing to compare against,
      // so just skip the check this load rather than guessing.
    }

    if (lastActive && Date.now() - lastActive > IDLE_THRESHOLD_MS) {
      forceSignOut(Date.now() - lastActive > DORMANT_THRESHOLD_MS ? 'inactive' : 'idle')
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
        return
      }
      // Keeps the persisted timestamp reasonably fresh (within one tick)
      // so closing the tab mid-session doesn't leave a stale mount-time
      // value behind for the on-mount check above to compare against.
      try {
        localStorage.setItem(LAST_ACTIVE_KEY, String(lastInteractionRef.current))
      } catch {}
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
