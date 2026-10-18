import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { toE164 } from '@/lib/phoneFormat'

// Mirrors /api/tenancy/link-invite: fills in co_owner_user_id on a
// pending-by-email row once the invited person actually signs up. Status
// stays 'pending' even after linking — unlike a tenancy invite, this
// still needs the explicit accept step (see /api/co-owner/accept)
// before real access opens up, since co-ownership is a much bigger
// grant than one tenancy.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ ok: true, linked: false })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: emailInvite, error: emailInviteError } = await supabaseAdmin
    .from('landlord_co_owners')
    .select('id')
    .eq('invited_email', user.email.toLowerCase())
    .is('co_owner_user_id', null)
    .order('invited_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (emailInviteError) {
    console.error('co-owner/link-invite: error fetching invite', emailInviteError)
    return NextResponse.json({ error: emailInviteError.message }, { status: 500 })
  }

  let invite = emailInvite

  // No match by email — try by phone. invited_phone is always stored
  // E.164-normalized (see co-owner/invite-email), so normalizing this
  // user's own saved phone the same way is enough for a plain equality
  // match, no fuzzy comparison needed here.
  if (!invite) {
    const { data: ownRow } = await supabaseAdmin.from('users').select('phone').eq('id', user.id).maybeSingle()
    const ownPhone = ownRow?.phone ? toE164(ownRow.phone) : null
    if (ownPhone) {
      const { data: phoneInvite, error: phoneInviteError } = await supabaseAdmin
        .from('landlord_co_owners')
        .select('id')
        .eq('invited_phone', ownPhone)
        .is('co_owner_user_id', null)
        .order('invited_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (phoneInviteError) {
        console.error('co-owner/link-invite: error fetching invite by phone', phoneInviteError)
        return NextResponse.json({ error: phoneInviteError.message }, { status: 500 })
      }
      invite = phoneInvite
    }
  }

  if (!invite) {
    return NextResponse.json({ ok: true, linked: false })
  }

  const { error: updateError } = await supabaseAdmin
    .from('landlord_co_owners')
    .update({ co_owner_user_id: user.id })
    .eq('id', invite.id)

  if (updateError) {
    console.error('co-owner/link-invite: error linking', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, linked: true })
}
