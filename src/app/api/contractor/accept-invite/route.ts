import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendContractorInviteAcceptedEmail } from '@/lib/email'
import { emailAllowed } from '@/lib/notificationPrefs'
import { sendPush } from '@/lib/push'
import { toE164 } from '@/lib/phoneFormat'

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

  const { data: acceptedByEmail, error } = await supabaseAdmin
    .from('contractor_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('contractor_email', user.email.toLowerCase())
    .eq('status', 'pending')
    .select('landlord_user_id')

  if (error) {
    console.error('accept-invite: update failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Also accept any pending invite that reached this person by phone —
  // invited_phone is always stored E.164-normalized (see
  // invite-contractor), so normalizing this user's own saved phone the
  // same way is enough for a plain equality match. Gated on
  // phone_verified_at — the phone field is just free text a user types
  // in, and without requiring proof of ownership first, anyone could type
  // in someone else's phone number to falsely show up as having accepted
  // their invite. Same reasoning as the identical fix in
  // tenancy/link-invite and co-owner/link-invite; this was the one invite
  // flow that never got it.
  let acceptedByPhone: { landlord_user_id: string | null }[] = []
  let phoneMatchNeedsVerification = false
  const { data: ownRow } = await supabaseAdmin.from('users').select('phone, phone_verified_at').eq('id', user.id).maybeSingle()
  const isPhoneVerified = !!ownRow?.phone_verified_at
  const ownPhone = ownRow?.phone ? toE164(ownRow.phone) : null
  if (ownPhone) {
    const { data: phoneInvites, error: phoneError } = await supabaseAdmin
      .from('contractor_invites')
      .select('id, landlord_user_id')
      .eq('invited_phone', ownPhone)
      .eq('status', 'pending')
    if (phoneError) {
      console.error('accept-invite: lookup by phone failed', phoneError)
    } else if (phoneInvites && phoneInvites.length > 0) {
      if (isPhoneVerified) {
        const { data, error: updateError } = await supabaseAdmin
          .from('contractor_invites')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .in('id', phoneInvites.map((i) => i.id))
          .select('landlord_user_id')
        if (updateError) {
          console.error('accept-invite: update by phone failed', updateError)
        } else {
          acceptedByPhone = data || []
        }
      } else {
        phoneMatchNeedsVerification = true
      }
    }
  }

  const acceptedInvites = [...(acceptedByEmail || []), ...acceptedByPhone]

  // The inviting landlord(s) used to get no signal this ever worked, short
  // of manually rechecking their pending-invites list. A contractor could
  // in principle have been invited by more than one landlord before
  // signing up, so this notifies all of them, not just the first.
  const landlordIds = [...new Set((acceptedInvites || []).map((i) => i.landlord_user_id).filter(Boolean))]
  if (landlordIds.length > 0) {
    const { data: contractorRow } = await supabaseAdmin.from('users').select('full_name').eq('id', user.id).maybeSingle()
    const contractorName = contractorRow?.full_name || user.email

    await Promise.allSettled(
      landlordIds.map(async (landlordId) => {
        const { data: landlord } = await supabaseAdmin
          .from('users')
          .select('email, full_name, preferred_language, email_notifications_enabled')
          .eq('id', landlordId)
          .maybeSingle()
        if (landlord?.email && emailAllowed(landlord)) {
          await sendContractorInviteAcceptedEmail({
            to: landlord.email,
            landlordName: landlord.full_name || 'there',
            contractorName,
            lang: landlord.preferred_language === 'es' ? 'es' : 'en',
          })
        }
        await sendPush(landlordId, {
          title: 'Contractor joined',
          body: `${contractorName} accepted your invite.`,
          url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord/jobs`,
        }).catch((err) => console.error('accept-invite: sendPush failed', { landlordId, err }))
      })
    )
  }

  return NextResponse.json({ ok: true, phoneMatchNeedsVerification })
}
