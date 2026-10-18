import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendRenterInviteEmail, buildRenterInviteSms } from '@/lib/email'
import { sendAlertSms } from '@/lib/sms'

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { inviteId } = (await request.json()) as { inviteId?: string }
  if (!inviteId) {
    return NextResponse.json({ error: 'Missing inviteId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from('tenancy_invites')
    .select('id, renter_email, renter_phone, landlord_user_id, units(unit_number, properties(address))')
    .eq('id', inviteId)
    .maybeSingle()

  if (inviteError) {
    console.error('invite-renter: error fetching invite', { inviteId, inviteError })
  }

  if (!invite || invite.landlord_user_id !== user.id) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  const { data: landlordData } = await supabaseAdmin
    .from('users')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const unit = invite.units as any
  const unitLabel = unit
    ? `${unit.properties?.address}${unit.unit_number ? `, Unit ${unit.unit_number}` : ''}`
    : 'your unit'

  const landlordName = landlordData?.full_name || 'Your landlord'

  if (invite.renter_email) {
    const result = await sendRenterInviteEmail({ to: invite.renter_email, landlordName, unitLabel })
    if (!result.ok) {
      console.error('invite-renter: sendEmail failed', { inviteId, result })
      return NextResponse.json({ error: 'Could not send invite email' }, { status: 500 })
    }
  } else if (invite.renter_phone) {
    const result = await sendAlertSms(invite.renter_phone, buildRenterInviteSms(landlordName, unitLabel))
    if (!result.ok) {
      console.error('invite-renter: sendAlertSms failed', { inviteId, result })
      return NextResponse.json({ error: 'Could not send invite text' }, { status: 500 })
    }
    await supabaseAdmin.from('notification_log').insert({
      notification_type: 'tenancy_invite',
      channel: 'sms',
      recipient_user_id: user.id, // no invitee account yet — logged under the inviter so it's still traceable
      external_id: result.id || null,
    })
  } else {
    return NextResponse.json({ error: 'Invite has no email or phone' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
