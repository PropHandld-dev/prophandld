import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Marks any pending contractor_invites for this email as accepted once
// they actually sign up. There's no tenancy/lease payload to create
// here (unlike the renter invite) — the contractor now just exists on
// the platform and shows up normally once they set up a service
// profile; this just closes the loop on the inviting landlord's
// pending-invites list.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { error } = await supabaseAdmin
    .from('contractor_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('contractor_email', user.email.toLowerCase())
    .eq('status', 'pending')

  if (error) {
    console.error('accept-invite: update failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
