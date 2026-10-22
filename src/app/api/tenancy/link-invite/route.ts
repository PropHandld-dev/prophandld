import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendRenterInviteAcceptedEmail, sendRenterTenancyLinkedEmail } from '@/lib/email'
import { emailAllowed } from '@/lib/notificationPrefs'
import { sendPush } from '@/lib/push'
import { toE164 } from '@/lib/phoneFormat'

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

  const { data: emailInvite, error: inviteError } = await supabaseAdmin
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

  let invite = emailInvite
  // True when a pending invite matches this user's phone number but can't
  // be auto-linked because that phone isn't verified yet — surfaced to the
  // client so it can nudge them to verify instead of silently doing
  // nothing, which is what the unverified-phone security fix below would
  // otherwise look like from the renter's side.
  let phoneMatchNeedsVerification = false

  // No match by email — try by phone. renter_phone is always stored
  // E.164-normalized (see sendInvite in tenancy/new/page.tsx), so
  // normalizing this user's own saved phone the same way is enough for a
  // plain equality match. Gated on phone_verified_at because the phone
  // field itself is just free text a user types in — without requiring
  // proof of ownership first, anyone could type in someone else's phone
  // number right after signup and get auto-linked into THEIR pending
  // tenancy (lease terms, rent amount, landlord contact — no accept step,
  // this creates the tenancy row immediately). Same check the phone-
  // verified badge on Profile uses: verified AND still matches the
  // current phone (a later edit clears verification, see
  // clear_phone_verification_on_change).
  if (!invite) {
    const { data: ownRow } = await supabaseAdmin.from('users').select('phone, phone_verified_at').eq('id', user.id).maybeSingle()
    const isPhoneVerified = !!ownRow?.phone_verified_at
    const rawPhone = ownRow?.phone ? toE164(ownRow.phone) : null
    if (rawPhone) {
      const { data: phoneInvite, error: phoneInviteError } = await supabaseAdmin
        .from('tenancy_invites')
        .select('*')
        .eq('renter_phone', rawPhone)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (phoneInviteError) {
        console.error('link-invite: error fetching invite by phone', phoneInviteError)
        return NextResponse.json({ error: phoneInviteError.message }, { status: 500 })
      }
      if (phoneInvite && isPhoneVerified) {
        invite = phoneInvite
      } else if (phoneInvite) {
        phoneMatchNeedsVerification = true
      }
    }
  }

  if (!invite) {
    return NextResponse.json({ ok: true, linked: false, phoneMatchNeedsVerification })
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

  // Neither side used to get any signal this ever worked — the landlord
  // only by manually rechecking their pending-invites list, the renter not
  // at all, beyond inferring it from what they saw on their own dashboard.
  if (invite.landlord_user_id) {
    const [{ data: landlord }, { data: unitRow }, { data: renterRow }] = await Promise.all([
      supabaseAdmin.from('users').select('email, full_name, preferred_language, email_notifications_enabled').eq('id', invite.landlord_user_id).maybeSingle(),
      supabaseAdmin.from('units').select('unit_number, properties(address)').eq('id', invite.unit_id).maybeSingle(),
      supabaseAdmin.from('users').select('full_name, preferred_language, email_notifications_enabled').eq('id', user.id).maybeSingle(),
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
      }).catch((err) => console.error('link-invite: landlord notification email failed', err))
    }
    sendPush(invite.landlord_user_id, {
      title: 'Tenant joined',
      body: `${renterName} accepted your invite for ${unitLabel}.`,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord`,
    }).catch((err) => console.error('link-invite: landlord notification push failed', err))

    if (emailAllowed(renterRow)) {
      sendRenterTenancyLinkedEmail({
        to: user.email,
        renterName,
        landlordName: landlord?.full_name || 'your landlord',
        unitLabel,
        lang: renterRow?.preferred_language === 'es' ? 'es' : 'en',
      }).catch((err) => console.error('link-invite: renter notification email failed', err))
    }
  }

  return NextResponse.json({ ok: true, linked: true })
}
