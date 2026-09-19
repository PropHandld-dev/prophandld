import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Auto-links a just-signed-up renter to their pending tenancy invite.
// Runs server-side with the service role key because the newly-created
// renter is not the unit's landlord — the tenancies INSERT policy
// (correctly) only allows the landlord to create a tenancy row, so this
// used to fail silently via RLS when attempted from the renter's own
// client session, leaving the invite stuck on "pending" forever even
// though signup succeeded.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from('tenancy_invites')
    .select('*')
    .eq('renter_email', user.email)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (inviteError) {
    console.error('link-invite: error fetching invite', inviteError)
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }
  if (!invite) {
    return NextResponse.json({ ok: true, linked: false })
  }

  const { error: tenancyError } = await supabaseAdmin
    .from('tenancies')
    .insert({
      unit_id: invite.unit_id,
      renter_user_id: user.id,
      rent_amount: invite.rent_amount,
      rent_due_day: invite.rent_due_day,
      lease_start: invite.lease_start,
      lease_end: invite.lease_end,
      security_deposit: invite.security_deposit,
      escalation_percent: invite.escalation_percent,
      escalation_frequency_months: invite.escalation_frequency_months,
      occupants: invite.occupants,
      pets: invite.pets,
      lease_notes: invite.lease_notes,
    })

  if (tenancyError) {
    console.error('link-invite: error creating tenancy', tenancyError)
    return NextResponse.json({ error: tenancyError.message }, { status: 500 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('tenancy_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  if (updateError) {
    console.error('link-invite: error marking invite accepted', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, linked: true })
}
