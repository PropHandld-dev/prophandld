import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendCoOwnerInviteEmail, buildCoOwnerInviteSms } from '@/lib/email'
import { sendAlertSms } from '@/lib/sms'
import { toE164 } from '@/lib/phoneFormat'

// Re-sending with the same email on purpose falls through to sendEmail()
// again even after the insert hits its unique-constraint 23505 (that's
// the "send it again" retry path a landlord who lost the first email
// needs) — which means nothing else caps repeat sends to an arbitrary
// address. Same rate-limit shape as /api/co-owner/invite, for the same
// reason.
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

// Mirrors /api/co-renter/invite: the next step when /api/co-owner/invite
// returns no_account_found — sends a signup link and tracks the pending
// invite by email so it shows up on the primary's Profile page, auto-
// linking once they sign up (see /api/co-owner/link-invite).
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

  const { email, phone } = (await request.json().catch(() => ({}))) as { email?: string; phone?: string }
  const coOwnerEmail = email?.trim().toLowerCase()
  const coOwnerPhone = phone?.trim() ? toE164(phone.trim()) : null
  if (!coOwnerEmail && !coOwnerPhone) {
    return NextResponse.json({ error: phone?.trim() ? 'That doesn\'t look like a valid US phone number' : 'Missing email' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: landlordData } = await supabaseAdmin.from('users').select('full_name').eq('id', user.id).maybeSingle()
  const primaryLandlordName = landlordData?.full_name || 'A Prophandld landlord'

  const { error: insertError } = await supabaseAdmin
    .from('landlord_co_owners')
    .insert(
      coOwnerEmail
        ? { primary_landlord_user_id: user.id, invited_email: coOwnerEmail }
        : { primary_landlord_user_id: user.id, invited_phone: coOwnerPhone }
    )

  if (insertError && insertError.code !== '23505') {
    console.error('co-owner/invite-email: insert failed', insertError)
    return NextResponse.json({ error: 'Could not send invite' }, { status: 500 })
  }

  if (coOwnerEmail) {
    const result = await sendCoOwnerInviteEmail({ to: coOwnerEmail, primaryLandlordName })
    if (!result.ok) {
      console.error('co-owner/invite-email: sendEmail failed', result)
      return NextResponse.json({ error: 'Could not send invite email' }, { status: 500 })
    }
  } else {
    const result = await sendAlertSms(coOwnerPhone!, buildCoOwnerInviteSms(primaryLandlordName))
    if (!result.ok) {
      console.error('co-owner/invite-email: sendAlertSms failed', result)
      return NextResponse.json({ error: 'Could not send invite text' }, { status: 500 })
    }
    await supabaseAdmin.from('notification_log').insert({
      notification_type: 'co_owner_invite',
      channel: 'sms',
      recipient_user_id: user.id, // no invitee account yet — logged under the inviter so it's still traceable
      external_id: result.id || null,
    })
  }

  return NextResponse.json({ ok: true })
}
