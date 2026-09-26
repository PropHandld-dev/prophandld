import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { sendWelcomeEmail } from '@/lib/email'

// Fired once from /login's auto-detected-session branch — the moment an
// account first goes from "confirmed" to actually signed in. Never blocks
// the redirect it's called alongside; a failed send here just means no
// welcome email, not a broken login.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const role = user.user_metadata?.role
  if (role !== 'landlord' && role !== 'renter' && role !== 'contractor') {
    return NextResponse.json({ ok: true, sent: false })
  }

  const result = await sendWelcomeEmail({
    to: user.email,
    name: user.user_metadata?.full_name,
    role,
  })

  if (!result.ok) {
    console.error('welcome email: send failed', result.error)
    return NextResponse.json({ ok: false, sent: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sent: true })
}
