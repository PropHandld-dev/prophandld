import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 10

// Only ever called after Supabase's own signUp() has already revealed
// "this email is registered" (its empty-identities tell, already relied
// on elsewhere in the signup flow) — this just adds which role, so the
// popup can say "already linked to a Landlord account" instead of a bare
// "already registered." No password, no new existence-disclosure beyond
// what signup already surfaces.
export async function POST(request: NextRequest) {
  const { email } = (await request.json().catch(() => ({}))) as { email?: string }
  if (!email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data } = await admin.from('users').select('role').eq('email', email).maybeSingle()

  return NextResponse.json({ exists: !!data, role: data?.role || null })
}
