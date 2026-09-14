import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendRenterInviteEmail } from '@/lib/email'

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
    .select('id, renter_email, landlord_user_id, units(unit_number, properties(address))')
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
    ? `${unit.properties?.address}${unit.unit_number ? ` — Unit ${unit.unit_number}` : ''}`
    : 'your unit'

  const result = await sendRenterInviteEmail({
    to: invite.renter_email,
    landlordName: landlordData?.full_name || 'Your landlord',
    unitLabel,
  })

  if (!result.ok) {
    console.error('invite-renter: sendEmail failed', { inviteId, result })
    return NextResponse.json({ error: 'Could not send invite email' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
