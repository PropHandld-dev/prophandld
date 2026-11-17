import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 15

// Attaches pending-by-email PM client invites to the account that just
// signed in with that email. Called on every landlord login (same as
// /api/co-owner/link-invite), a no-op once nothing is left to link.
// Status stays 'pending': linking only makes the invite visible to the
// owner, who still explicitly accepts and chooses their own approval
// limit. Email-only matching is safe here because signup requires email
// confirmation, so the account provably controls this address.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ ok: true, linked: 0 })
  }

  const admin = getSupabaseAdmin()
  const { data: invites, error } = await admin
    .from('pm_client_portfolios')
    .select('id, organization_id')
    .eq('invited_email', user.email.toLowerCase())
    .is('owner_user_id', null)

  if (error) {
    console.error('pm/clients/link-invite: lookup failed', error)
    return NextResponse.json({ error: 'Could not check invites' }, { status: 500 })
  }

  let linked = 0
  for (const invite of invites || []) {
    const { error: linkError } = await admin
      .from('pm_client_portfolios')
      .update({ owner_user_id: user.id })
      .eq('id', invite.id)
      .is('owner_user_id', null)
    if (!linkError) {
      linked++
      continue
    }
    // 23505: this same org already has an invite tied to this account
    // (e.g. they also invited the account directly once it existed).
    // The email-only row is a duplicate of that one -- drop it rather
    // than leaving an orphan that can never link.
    if (linkError.code === '23505') {
      await admin.from('pm_client_portfolios').delete().eq('id', invite.id).is('owner_user_id', null)
    } else {
      console.error('pm/clients/link-invite: link failed', invite.id, linkError)
    }
  }

  return NextResponse.json({ ok: true, linked })
}
