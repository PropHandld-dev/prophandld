import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendContractorInviteEmail, buildContractorInviteSms } from '@/lib/email'
import { sendAlertSms } from '@/lib/sms'

// Re-sends to the exact same stored email/phone on an existing pending
// invite — for "Twilio says delivered but they never got it" or just a
// nudge after days of silence. Deliberately not an edit: if the landlord
// typo'd the address, the fix is Cancel + a fresh invite with the
// corrected info (the existing form at the top of the page), not editing
// in place here. Cooldown exists so a landlord tapping twice doesn't
// double-send, not as a serious abuse control.
const COOLDOWN_MS = 2 * 60 * 1000

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords can resend a contractor invite' }, { status: 403 })
  }

  const { inviteId } = (await request.json()) as { inviteId?: string }
  if (!inviteId) {
    return NextResponse.json({ error: 'Missing inviteId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: invite, error: fetchError } = await supabaseAdmin
    .from('contractor_invites')
    .select('id, landlord_user_id, contractor_email, invited_phone, note, status, last_sent_at')
    .eq('id', inviteId)
    .maybeSingle()

  if (fetchError) {
    console.error('invite-contractor/resend: fetch failed', fetchError)
    return NextResponse.json({ error: 'Could not load invite' }, { status: 500 })
  }
  if (!invite || invite.landlord_user_id !== user.id) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }
  if (invite.status !== 'pending') {
    return NextResponse.json({ error: 'This invite is no longer pending' }, { status: 400 })
  }
  if (invite.last_sent_at && Date.now() - new Date(invite.last_sent_at).getTime() < COOLDOWN_MS) {
    return NextResponse.json({ error: 'Already resent recently. Give it a couple minutes before trying again.' }, { status: 429 })
  }

  const { data: landlordRow } = await supabaseAdmin.from('users').select('full_name').eq('id', user.id).maybeSingle()
  const landlordName = landlordRow?.full_name || 'A landlord'

  if (invite.contractor_email) {
    const result = await sendContractorInviteEmail({ to: invite.contractor_email, landlordName, note: invite.note })
    if (!result.ok) {
      console.error('invite-contractor/resend: sendEmail failed', result)
      return NextResponse.json({ error: 'Could not resend the email. Try again shortly.' }, { status: 500 })
    }
  } else if (invite.invited_phone) {
    const result = await sendAlertSms(invite.invited_phone, buildContractorInviteSms(landlordName))
    if (!result.ok) {
      console.error('invite-contractor/resend: sendAlertSms failed', result)
      return NextResponse.json({ error: 'Could not resend the text. Try again shortly.' }, { status: 500 })
    }
    await supabaseAdmin.from('notification_log').insert({
      notification_type: 'contractor_invite',
      channel: 'sms',
      recipient_user_id: user.id,
      external_id: result.id || null,
    })
  } else {
    return NextResponse.json({ error: 'This invite has no email or phone on file' }, { status: 400 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('contractor_invites')
    .update({ last_sent_at: new Date().toISOString() })
    .eq('id', inviteId)
  if (updateError) {
    console.error('invite-contractor/resend: last_sent_at update failed', updateError)
  }

  return NextResponse.json({ ok: true })
}
