import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendContractorInviteEmail } from '@/lib/email'

// Creates the invite row and sends the email in one call — unlike the
// tenant invite (which carries lease terms inserted client-side first),
// a contractor invite is just an email + optional note, so there's
// nothing gained by splitting create and send into two round trips.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.user_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords can invite contractors' }, { status: 403 })
  }

  const { email, note } = (await request.json()) as { email?: string; note?: string }
  if (!email || !email.trim()) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }
  const contractorEmail = email.trim().toLowerCase()

  const supabaseAdmin = getSupabaseAdmin()

  const { data: existingUserId } = await supabaseAdmin.rpc('get_user_id_by_email', { email_input: contractorEmail })
  if (existingUserId) {
    return NextResponse.json({ error: 'This email already has a Prophandld account. Message them directly instead.' }, { status: 400 })
  }

  const { data: existingInvite } = await supabaseAdmin
    .from('contractor_invites')
    .select('id')
    .eq('landlord_user_id', user.id)
    .eq('contractor_email', contractorEmail)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingInvite) {
    return NextResponse.json({ error: "You've already invited this email — check your pending invites below." }, { status: 400 })
  }

  const { data: landlordRow } = await supabaseAdmin
    .from('users')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const { data: invite, error: insertError } = await supabaseAdmin
    .from('contractor_invites')
    .insert({ landlord_user_id: user.id, contractor_email: contractorEmail, note: note?.trim() || null })
    .select('id')
    .single()

  if (insertError || !invite) {
    console.error('invite-contractor: insert failed', insertError)
    return NextResponse.json({ error: 'Could not create invite' }, { status: 500 })
  }

  const result = await sendContractorInviteEmail({
    to: contractorEmail,
    landlordName: landlordRow?.full_name || 'A landlord',
    note: note?.trim() || null,
  })

  if (!result.ok) {
    console.error('invite-contractor: sendEmail failed', result)
    return NextResponse.json({ error: 'Invite saved, but the email could not be sent. Try resending.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, inviteId: invite.id })
}
