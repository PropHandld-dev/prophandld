import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendContractorInviteAcceptedEmail } from '@/lib/email'
import { emailAllowed } from '@/lib/notificationPrefs'
import { sendPush } from '@/lib/push'

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

  const { data: acceptedInvites, error } = await supabaseAdmin
    .from('contractor_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('contractor_email', user.email.toLowerCase())
    .eq('status', 'pending')
    .select('landlord_user_id')

  if (error) {
    console.error('accept-invite: update failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

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

  return NextResponse.json({ ok: true })
}
