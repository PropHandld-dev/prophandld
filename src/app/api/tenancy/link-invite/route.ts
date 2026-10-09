import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendRenterInviteAcceptedEmail } from '@/lib/email'
import { emailAllowed } from '@/lib/notificationPrefs'
import { sendPush } from '@/lib/push'

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
    .eq('renter_email', user.email.toLowerCase())
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

  // The landlord who sent this used to get no signal it ever worked, short
  // of manually rechecking their pending-invites list.
  if (invite.landlord_user_id) {
    const [{ data: landlord }, { data: unitRow }, { data: renterRow }] = await Promise.all([
      supabaseAdmin.from('users').select('email, full_name, preferred_language, email_notifications_enabled').eq('id', invite.landlord_user_id).maybeSingle(),
      supabaseAdmin.from('units').select('unit_number, properties(address)').eq('id', invite.unit_id).maybeSingle(),
      supabaseAdmin.from('users').select('full_name').eq('id', user.id).maybeSingle(),
    ])
    const unitLabel = unitRow ? `${(unitRow.properties as any)?.address || 'your property'}${unitRow.unit_number ? `, Unit ${unitRow.unit_number}` : ''}` : 'your property'
    const renterName = renterRow?.full_name || user.email
    if (landlord?.email && emailAllowed(landlord)) {
      sendRenterInviteAcceptedEmail({
        to: landlord.email,
        landlordName: landlord.full_name || 'there',
        renterName,
        unitLabel,
        lang: landlord.preferred_language === 'es' ? 'es' : 'en',
      }).catch((err) => console.error('link-invite: notification email failed', err))
    }
    sendPush(invite.landlord_user_id, {
      title: 'Tenant joined',
      body: `${renterName} accepted your invite for ${unitLabel}.`,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord`,
    }).catch((err) => console.error('link-invite: notification push failed', err))
  }

  return NextResponse.json({ ok: true, linked: true })
}
