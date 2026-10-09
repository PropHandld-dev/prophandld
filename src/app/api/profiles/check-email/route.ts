import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 10

// Only meant to be called after Supabase's own signUp() has already
// revealed "this email is registered" (its empty-identities tell, already
// relied on elsewhere in the signup flow) — this just adds which role, so
// the popup can say "already linked to a Landlord account" instead of a
// bare "already registered." Nothing actually enforces that call order
// server-side, though: hit directly, this route lets anyone probe an
// arbitrary email for both existence and role, which is more than
// signUp's own tell ever reveals (it never gives up role). A real fix
// needs a shared rate-limit store (new table, new migration); as an
// immediate, zero-migration mitigation this caps requests per warm
// serverless instance so scripted enumeration can't run unthrottled.
const RATE_LIMIT = 8
const RATE_WINDOW_MS = 60_000
const hits = new Map<string, number[]>()

function rateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k)
  }
  return recent.length > RATE_LIMIT
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) {
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
