import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendCoOwnerInvitedExistingAccountEmail } from '@/lib/email'
import { emailAllowed } from '@/lib/notificationPrefs'
import { sendPush } from '@/lib/push'
import { sendAlertSms } from '@/lib/sms'

// This route both reveals account existence/role (a real email-
// enumeration surface, same shape as /api/profiles/check-email) AND
// fires a real notification (email/push/SMS) at whoever it resolves to —
// a bigger abuse surface than check-email's read-only lookup, since a
// malicious caller could use it to spam an arbitrary real phone number
// with repeated texts. Rate-limited per caller (not per IP: every caller
// here is already authenticated, so their own user id is the more
// precise key) rather than left unprotected the way co-renter/add is —
// the co-renter precedent only ever reaches one unit's household, this
// reaches a whole portfolio and now SMS too, so it gets the stricter
// treatment.
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60_000
const hits = new Map<string, number[]>()

function rateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k)
  }
  return recent.length > RATE_LIMIT
}

// Mirrors /api/co-renter/add's shape closely: role lives in app_metadata,
// which only a service-role client can read, so this has to be a server
// route, not a client-side insert. Unlike co-renter, this grants access
// to an entire portfolio rather than one unit, so it needs one extra
// guard a co-renter invite never needed: a co-owner has no portfolio of
// their own to invite someone into.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords can invite a co-owner' }, { status: 403 })
  }
  if (rateLimited(user.id)) {
    return NextResponse.json({ error: 'Too many invites sent, try again shortly' }, { status: 429 })
  }

  const { email } = (await request.json().catch(() => ({}))) as { email?: string }
  if (!email?.trim()) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }
  const coOwnerEmail = email.trim().toLowerCase()

  const supabaseAdmin = getSupabaseAdmin()

  const { data: existingCoOwnership } = await supabaseAdmin
    .from('landlord_co_owners')
    .select('id')
    .eq('co_owner_user_id', user.id)
    .eq('status', 'accepted')
    .maybeSingle()
  if (existingCoOwnership) {
    return NextResponse.json({ error: 'cannot_invite_as_co_owner' }, { status: 403 })
  }

  const { data: existingUserId } = await supabaseAdmin.rpc('get_user_id_by_email', { email_input: coOwnerEmail })

  if (!existingUserId) {
    // No dead end: the caller can offer to send an invite instead.
    return NextResponse.json({ error: 'no_account_found' }, { status: 404 })
  }

  if (existingUserId === user.id) {
    return NextResponse.json({ error: 'You can\'t invite yourself.' }, { status: 400 })
  }

  const { data: existingAuthUser } = await supabaseAdmin.auth.admin.getUserById(existingUserId)
  const existingRole = existingAuthUser?.user?.app_metadata?.role

  if (existingRole !== 'landlord') {
    return NextResponse.json(
      { error: `This email already has a Prophandld account (as a ${existingRole || 'different role'}), so it can't be added as a co-owner.` },
      { status: 400 }
    )
  }

  const { error: insertError } = await supabaseAdmin
    .from('landlord_co_owners')
    .insert({ primary_landlord_user_id: user.id, co_owner_user_id: existingUserId })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'already_invited' }, { status: 400 })
    }
    console.error('co-owner/invite: insert failed', insertError)
    return NextResponse.json({ error: 'Could not send the invite. That account may already be co-managing a different portfolio.' }, { status: 500 })
  }

  // Previously the invitee found out only if they happened to open their
  // own dashboard — no notification fired at all. Email, push, and SMS
  // are treated as equal channels here, not email-first with SMS as an
  // afterthought: this is exactly the kind of one-time, time-sensitive,
  // high-value event SMS_ENABLED_TYPES-style curation exists for
  // elsewhere in the app, so it's sent whenever the invitee has opted in
  // and has a phone on file, same gating every other SMS send in the app
  // already uses.
  const [{ data: inviterRow }, { data: inviteeRow }] = await Promise.all([
    supabaseAdmin.from('users').select('full_name').eq('id', user.id).maybeSingle(),
    supabaseAdmin.from('users').select('email, full_name, phone, sms_opt_in, preferred_language, email_notifications_enabled').eq('id', existingUserId).maybeSingle(),
  ])
  const primaryLandlordName = inviterRow?.full_name || 'A Prophandld landlord'
  const inviteeLang = inviteeRow?.preferred_language === 'es' ? 'es' : 'en'

  if (inviteeRow?.email && emailAllowed(inviteeRow)) {
    sendCoOwnerInvitedExistingAccountEmail({
      to: inviteeRow.email,
      primaryLandlordName,
      lang: inviteeLang,
    }).catch((err) => console.error('co-owner/invite: notification email failed', err))
  }
  sendPush(existingUserId, {
    title: 'Co-owner invite',
    body: `${primaryLandlordName} invited you to co-manage their properties.`,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord`,
  }).catch((err) => console.error('co-owner/invite: notification push failed', err))
  if (inviteeRow?.sms_opt_in && inviteeRow?.phone) {
    sendAlertSms(
      inviteeRow.phone,
      `Prophandld: ${primaryLandlordName} invited you to co-manage their properties. Log in to accept: ${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord`
    ).catch((err) => console.error('co-owner/invite: notification sms failed', err))
  }

  return NextResponse.json({ ok: true })
}
