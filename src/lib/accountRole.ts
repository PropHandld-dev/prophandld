import type { User } from '@supabase/supabase-js'

// app_metadata.role is the one authoritative, server-set, tamper-proof
// source of truth (see set-role/route.ts — the only place that ever
// writes it; every server-side route in this app already reads role from
// here exclusively, never user_metadata). user_metadata.role is a client-
// writable mirror, only ever meant as a fallback for the one real
// chicken-and-egg moment where app_metadata genuinely hasn't been stamped
// yet: a brand-new account's very first activation, on the session from
// the signup-confirmation link/code itself, before set-role has ever run
// for that user (see login/page.tsx's completeSignIn). Everywhere else —
// an already-active account on any later visit — app_metadata.role is
// already set and should always win.
//
// Found 2026-10 after a real report of a confirmed account landing on the
// marketing homepage instead of its dashboard after clicking "Continue to
// your dashboard": several client-side pages read user_metadata.role only,
// with no fallback, so any account whose user_metadata.role was ever
// missing or stale (whatever the original cause) had nowhere to land —
// including the landing page's own "already signed in, send them to their
// dashboard" redirect, which uses this same function, so a case like that
// no longer gets stuck with no path back to the dashboard either.
export function getAccountRole(user: Pick<User, 'app_metadata' | 'user_metadata'> | null | undefined): string | null {
  return user?.app_metadata?.role || user?.user_metadata?.role || null
}
