import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { tooManyRequests } from '@/lib/rateLimit'
import { toE164 } from '@/lib/phoneFormat'

// POST { email } or { phone } -> { renterId: string | null }
// Finds an existing RENTER account for "add a tenant", so they're linked
// straight away instead of being sent an invite. Done here, with the role
// checked server-side, because the two-argument SQL helper the browser
// used (get_user_id_by_email(email, role)) was never created in
// production: every lookup silently failed and fell back to an invite.
// Landlords only, rate-limited, and it only ever answers for renter
// accounts (an email belonging to a contractor or landlord returns null,
// so the landlord sends an invite instead of linking the wrong account).
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user.app_metadata?.role !== 'landlord') return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (await tooManyRequests(`resolve-renter:${user.id}`, 30, 10)) {
    return NextResponse.json({ error: 'Too many lookups. Wait a few minutes.' }, { status: 429 })
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string; phone?: string }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const phone = typeof body.phone === 'string' && body.phone.trim() ? toE164(body.phone.trim()) : null
  if (!email && !phone) return NextResponse.json({ error: 'Enter an email or phone' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const { data: id } = email
    ? await admin.rpc('get_user_id_by_email', { email_input: email })
    : await admin.rpc('get_user_id_by_phone', { phone_input: phone, role_input: 'renter' })
  if (!id) return NextResponse.json({ renterId: null })

  const { data: authUser } = await admin.auth.admin.getUserById(String(id))
  return NextResponse.json({ renterId: authUser?.user?.app_metadata?.role === 'renter' ? String(id) : null })
}
