import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendCoRenterInviteEmail, buildCoRenterInviteSms } from '@/lib/email'
import { sendAlertSms } from '@/lib/sms'
import { toE164 } from '@/lib/phoneFormat'

// Previously, trying to add a co-renter who hadn't signed up yet was a
// dead end: "No Prophandld account found with that email," full stop.
// This gives the landlord a real next step instead.
//
// Rate-limited now that this can fire a real SMS at an arbitrary phone
// number too, same reasoning as co-renter/add and co-owner/invite.
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

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (rateLimited(user.id)) {
    return NextResponse.json({ error: 'Too many attempts, try again shortly' }, { status: 429 })
  }

  const { tenancyId, email, phone } = (await request.json()) as { tenancyId?: string; email?: string; phone?: string }
  const coRenterEmail = email?.trim().toLowerCase()
  const coRenterPhone = phone?.trim() ? toE164(phone.trim()) : null
  if (!tenancyId || (!coRenterEmail && !coRenterPhone)) {
    return NextResponse.json({ error: phone?.trim() ? 'That doesn\'t look like a valid US phone number' : 'Missing tenancyId or email' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: tenancy, error: tenancyError } = await supabaseAdmin
    .from('tenancies')
    .select('id, units(unit_number, properties(address, owner_user_id))')
    .eq('id', tenancyId)
    .maybeSingle()

  if (tenancyError || !tenancy) {
    return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  }

  const unit = tenancy.units as any
  if (unit?.properties?.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized for this unit' }, { status: 403 })
  }

  const { data: landlordData } = await supabaseAdmin.from('users').select('full_name').eq('id', user.id).maybeSingle()
  const unitLabel = `${unit?.properties?.address || 'your unit'}${unit?.unit_number ? `, Unit ${unit.unit_number}` : ''}`

  const landlordName = landlordData?.full_name || 'Your landlord'

  if (coRenterEmail) {
    const result = await sendCoRenterInviteEmail({ to: coRenterEmail, landlordName, unitLabel })
    if (!result.ok) {
      console.error('co-renter/invite: sendEmail failed', result)
      return NextResponse.json({ error: 'Could not send invite email' }, { status: 500 })
    }
  } else {
    const result = await sendAlertSms(coRenterPhone!, buildCoRenterInviteSms(landlordName, unitLabel))
    if (!result.ok) {
      console.error('co-renter/invite: sendAlertSms failed', result)
      return NextResponse.json({ error: 'Could not send invite text' }, { status: 500 })
    }
    await supabaseAdmin.from('notification_log').insert({
      notification_type: 'co_renter_invite',
      channel: 'sms',
      recipient_user_id: user.id, // no invitee account yet — logged under the inviter so it's still traceable
      external_id: result.id || null,
    })
  }

  return NextResponse.json({ ok: true })
}
