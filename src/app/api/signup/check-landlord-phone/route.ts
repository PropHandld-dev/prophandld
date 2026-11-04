import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { tooManyRequests } from '@/lib/rateLimit'

export const maxDuration = 10

// Closes the free-tier loophole Joshua flagged: tierForUnitCount() counts
// units per account with no cross-account identity check, so nothing
// stops one person signing up as a landlord 5 separate times (5 different
// emails) and adding one property to each, staying free on all 5 instead
// of paying for a real 5-unit account. A phone number is far cheaper to
// verify and harder to multiply than an email address — this is a
// pre-flight check, called before supabase.auth.signUp() in the signup
// page's landlord path, so a duplicate never gets an account created at
// all. The Stripe Connect bank-fingerprint check (see account.updated in
// webhooks/stripe/route.ts) is the other half, catching the same loophole
// from the payout side once a bank account is actually linked.
//
// Same unauthenticated-enumeration shape as /api/profiles/check-email —
// rate-limited through the same shared, cross-instance table.
const RATE_LIMIT = 8
const RATE_WINDOW_MINUTES = 1

// Digits-only, last 10 — tolerant of "(215) 555-1234" vs "215-555-1234"
// vs "+12155551234" all meaning the same real number, without requiring
// the stored value to already be in any particular format.
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (await tooManyRequests(`check-landlord-phone:${ip}`, RATE_LIMIT, RATE_WINDOW_MINUTES)) {
    return NextResponse.json({ error: 'Too many requests, try again shortly' }, { status: 429 })
  }

  const { phone } = (await request.json().catch(() => ({}))) as { phone?: string }
  const normalized = phone ? normalizePhone(phone) : ''
  if (normalized.length !== 10) {
    return NextResponse.json({ duplicate: false })
  }

  const admin = getSupabaseAdmin()

  // phone isn't stored in any particular format, so this reads every
  // non-null phone and normalizes in app code rather than trying to match
  // in SQL — fine at today's scale (this runs once per landlord signup
  // attempt, not a hot path), would want an indexed normalized column if
  // the users table ever gets large enough for this to matter.
  const { data: candidates } = await admin.from('users').select('id, phone').not('phone', 'is', null)
  const matches = (candidates || []).filter((u) => u.phone && normalizePhone(u.phone) === normalized)
  if (matches.length === 0) {
    return NextResponse.json({ duplicate: false })
  }

  // role lives only in auth.users.app_metadata, never a public.users
  // column (same as check-email) — only a match against an existing
  // LANDLORD account is this loophole; a renter or contractor sharing a
  // household phone with a landlord is unrelated and shouldn't be blocked.
  for (const match of matches) {
    const { data: authUser } = await admin.auth.admin.getUserById(match.id)
    if (authUser?.user?.app_metadata?.role === 'landlord') {
      return NextResponse.json({ duplicate: true })
    }
  }

  return NextResponse.json({ duplicate: false })
}
