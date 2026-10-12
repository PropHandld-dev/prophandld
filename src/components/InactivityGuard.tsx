'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const LAST_ACTIVE_KEY = 'prophandld_last_active'
// 60 days: long enough that a renter who only opens the app once a month
// for rent (the least frequent normal use case in this app) never gets
// caught by it, short enough to actually cut off a genuinely forgotten,
// long-dormant session — a lost/replaced phone, a shared or public
// computer nobody came back to, an account someone stopped using. Tune
// here if that balance should shift; it's the only number that matters
// in this file.
const INACTIVE_THRESHOLD_MS = 60 * 24 * 60 * 60 * 1000

// Supabase's own refresh token would otherwise keep a session alive
// indefinitely as long as *something* refreshes it before it expires —
// there's no built-in "log out if nobody's opened the app in months."
// Deliberately a per-device localStorage clock, not a server-tracked
// last-active column: zero extra network round trip on every single page
// load (this app's stated top priority is no added lag), at the cost of
// being reset if someone clears site data — an acceptable trade for what
// this defends against (a forgotten dormant session), not a hard security
// boundary against someone actively trying to evade it.
//
// Rendered as a sibling of {children} in each role's layout.tsx (a Server
// Component, where requireRole() already does the real, unbypassable
// role check) — this is a client-side addition alongside it, not a
// replacement for it. Signs out through the same client-side
// supabase.auth.signOut() every other sign-out in this app already uses
// (see profile/page.tsx) — a Server Component can't reliably clear
// session cookies itself in Next.js, so this has to run in the browser.
export function InactivityGuard() {
  useEffect(() => {
    let lastActive: number | null = null
    try {
      const stored = localStorage.getItem(LAST_ACTIVE_KEY)
      lastActive = stored ? Number(stored) : null
    } catch {
      // Private browsing / blocked storage — nothing to compare against,
      // so just skip the check this load rather than guessing.
    }

    if (lastActive && Date.now() - lastActive > INACTIVE_THRESHOLD_MS) {
      supabase.auth.signOut().finally(() => {
        window.location.href = '/login?reason=inactive'
      })
      return
    }

    try {
      localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()))
    } catch {}
  }, [])

  return null
}
