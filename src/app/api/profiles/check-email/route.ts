import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { tooManyRequests } from '@/lib/rateLimit'

export const maxDuration = 10

// Only meant to be called after Supabase's own signUp() has already
// revealed "this email is registered" (its empty-identities tell, already
// relied on elsewhere in the signup flow) — this just adds which role, so
// the popup can say "already linked to a Landlord account" instead of a
// bare "already registered." Nothing actually enforces that call order
// server-side, though: hit directly, this route lets anyone probe an
// arbitrary email for both existence and role, which is more than
// signUp's own tell ever reveals (it never gives up role). Rate-limited
// through the shared, cross-instance table (see rateLimit.ts) rather than
// an in-memory per-warm-instance cap, which reset on every cold start and
// shared nothing across Vercel's serverless instances — trivially
// bypassable by spreading requests over time.
const RATE_LIMIT = 8
const RATE_WINDOW_MINUTES = 1

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (await tooManyRequests(`check-email:${ip}`, RATE_LIMIT, RATE_WINDOW_MINUTES)) {
    return NextResponse.json({ error: 'Too many requests, try again shortly' }, { status: 429 })
  }

  const { email } = (await request.json().catch(() => ({}))) as { email?: string }
  if (!email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data } = await admin.from('users').select('id').eq('email', email).maybeSingle()
  if (!data) {
    return NextResponse.json({ exists: false, role: null })
  }

  // role lives only in auth.users.app_metadata, never a public.users
  // column.
  const { data: authUser } = await admin.auth.admin.getUserById(data.id)
  return NextResponse.json({ exists: true, role: authUser?.user?.app_metadata?.role || null })
}
