import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendCoOwnerAcceptedEmail } from '@/lib/email'
import { emailAllowed } from '@/lib/notificationPrefs'
import { sendPush } from '@/lib/push'
import { sendAlertSms } from '@/lib/sms'

// Accept runs server-side (not a bare client-side RLS update) so the
// primary's confirmation email+push can be sent in the same request —
// Postgres can't make outbound HTTP calls to Resend/web-push from a
// trigger, so there's no DB-level way to fire this. The update itself
// still goes through the user's own session (not service-role), so the
// co_owner_accepts_own_invite RLS policy is the real authorization check;
// this route just adds the notification on top, mirroring
// /api/tenancy/link-invite's "tell the other side it worked" pattern.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { inviteId } = (await request.json().catch(() => ({}))) as { inviteId?: string }
  if (!inviteId) {
    return NextResponse.json({ error: 'Missing inviteId' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await authClient
    .from('landlord_co_owners')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', inviteId)
    .select('primary_landlord_user_id')
    .maybeSingle()

  if (updateError || !updated) {
    console.error('co-owner/accept: update failed', updateError)
    return NextResponse.json({ error: 'Could not accept the invite' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const [{ data: primary }, { data: coOwner }] = await Promise.all([
    supabaseAdmin.from('users').select('email, full_name, phone, sms_opt_in, preferred_language, email_notifications_enabled').eq('id', updated.primary_landlord_user_id).maybeSingle(),
    supabaseAdmin.from('users').select('full_name').eq('id', user.id).maybeSingle(),
  ])
  const coOwnerName = coOwner?.full_name || user.email || 'Your co-owner'

  // Awaited (concurrently, not sequentially) rather than fire-and-forget —
  // a serverless function's execution can be torn down the instant the
  // response right below is sent, which this routinely raced and lost.
  await Promise.all([
    primary?.email && emailAllowed(primary)
      ? sendCoOwnerAcceptedEmail({
          to: primary.email,
          primaryLandlordName: primary.full_name || 'there',
          coOwnerName,
          lang: primary.preferred_language === 'es' ? 'es' : 'en',
        }).catch((err) => console.error('co-owner/accept: notification email failed', err))
      : Promise.resolve(),
    sendPush(updated.primary_landlord_user_id, {
      title: 'Co-owner joined',
      body: `${coOwnerName} accepted your invite to co-manage your properties.`,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/profile`,
    }).catch((err) => console.error('co-owner/accept: notification push failed', err)),
    // Same equal-channel treatment as the initial invite (see
    // /api/co-owner/invite) — this is as time-sensitive and high-value an
    // event as that one.
    primary?.sms_opt_in && primary?.phone
      ? sendAlertSms(primary.phone, `Prophandld: ${coOwnerName} accepted your invite to co-manage your properties.`)
          .then((result) => {
            if (result.ok) {
              return supabaseAdmin.from('notification_log').insert({
                notification_type: 'co_owner_accepted',
                channel: 'sms',
                recipient_user_id: updated.primary_landlord_user_id,
                external_id: result.id || null,
              })
            }
          })
          .catch((err) => console.error('co-owner/accept: notification sms failed', err))
      : Promise.resolve(),
  ])

  return NextResponse.json({ ok: true })
}
