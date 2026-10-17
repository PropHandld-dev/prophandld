import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendCoRenterAddedEmail } from '@/lib/email'
import { emailAllowed } from '@/lib/notificationPrefs'
import { sendPush } from '@/lib/push'
import { sendAlertSms } from '@/lib/sms'

// Adding a co-renter used to go straight from the browser: look up the
// email, insert into tenancy_occupants, done — with no check at all that
// the account found was actually a renter. Confirmed in testing: a
// contractor's email went in with zero warning, and then showed up
// labeled "Renter" in that unit's job chat. Role lives in app_metadata,
// which only a service-role client can read (see invite-contractor for
// the same pattern), so this has to be a server route, not a client-side
// RPC call.
//
// Rate-limited the same way /api/co-owner/invite is: this now fires a
// real SMS at whoever the email resolves to, which is an abuse surface
// (spam an arbitrary phone number via repeated add/remove) regardless of
// how small the resulting blast radius is.
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

  const { tenancyId, email } = (await request.json()) as { tenancyId?: string; email?: string }
  if (!tenancyId || !email?.trim()) {
    return NextResponse.json({ error: 'Missing tenancyId or email' }, { status: 400 })
  }
  const coRenterEmail = email.trim().toLowerCase()

  const supabaseAdmin = getSupabaseAdmin()

  const { data: tenancy, error: tenancyError } = await supabaseAdmin
    .from('tenancies')
    .select('id, occupants, unit_id, units(unit_number, properties(address, owner_user_id))')
    .eq('id', tenancyId)
    .maybeSingle()

  if (tenancyError || !tenancy) {
    return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  }

  const property = (tenancy.units as any)?.properties
  if (property?.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized for this unit' }, { status: 403 })
  }

  const { count: existingOccupants } = await supabaseAdmin
    .from('tenancy_occupants')
    .select('id', { count: 'exact', head: true })
    .eq('tenancy_id', tenancyId)

  const maxCoRenters = tenancy.occupants ? Math.max(tenancy.occupants - 1, 0) : 5
  if ((existingOccupants ?? 0) >= maxCoRenters) {
    return NextResponse.json({ error: 'occupant_limit_reached', maxCoRenters }, { status: 400 })
  }

  const { data: existingUserId } = await supabaseAdmin.rpc('get_user_id_by_email', { email_input: coRenterEmail })

  if (!existingUserId) {
    // No dead end: the caller can offer to send an invite instead.
    return NextResponse.json({ error: 'no_account_found' }, { status: 404 })
  }

  const { data: existingAuthUser } = await supabaseAdmin.auth.admin.getUserById(existingUserId)
  const existingRole = existingAuthUser?.user?.app_metadata?.role

  if (existingRole !== 'renter') {
    return NextResponse.json(
      { error: `This email already has a Prophandld account (as a ${existingRole || 'different role'}), so it can't be added as a co-renter.` },
      { status: 400 }
    )
  }

  const { error: insertError } = await supabaseAdmin
    .from('tenancy_occupants')
    .insert({ tenancy_id: tenancyId, renter_user_id: existingUserId })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'already_co_renter' }, { status: 400 })
    }
    console.error('co-renter/add: insert failed', insertError)
    return NextResponse.json({ error: 'Could not add co-renter' }, { status: 500 })
  }

  // Previously silent — the added co-renter had no way to know they'd been
  // linked into someone else's tenancy until they happened to check their
  // own Profile. Email, push, and SMS are equal channels here, same as
  // every other invite-style notification in the app, not email-first.
  const unit = tenancy.units as any
  const unitLabel = `${property?.address || 'a unit'}${unit?.unit_number ? `, Unit ${unit.unit_number}` : ''}`
  const [{ data: landlordRow }, { data: inviteeRow }] = await Promise.all([
    supabaseAdmin.from('users').select('full_name').eq('id', user.id).maybeSingle(),
    supabaseAdmin.from('users').select('email, phone, sms_opt_in, preferred_language, email_notifications_enabled').eq('id', existingUserId).maybeSingle(),
  ])
  const landlordName = landlordRow?.full_name || 'Your landlord'
  const inviteeLang = inviteeRow?.preferred_language === 'es' ? 'es' : 'en'

  if (inviteeRow?.email && emailAllowed(inviteeRow)) {
    sendCoRenterAddedEmail({
      to: inviteeRow.email,
      landlordName,
      unitLabel,
      lang: inviteeLang,
    }).catch((err) => console.error('co-renter/add: notification email failed', err))
  }
  sendPush(existingUserId, {
    title: 'Added as co-renter',
    body: `${landlordName} added you as a co-renter for ${unitLabel}.`,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/profile`,
  }).catch((err) => console.error('co-renter/add: notification push failed', err))
  if (inviteeRow?.sms_opt_in && inviteeRow?.phone) {
    sendAlertSms(
      inviteeRow.phone,
      `Prophandld: ${landlordName} added you as a co-renter for ${unitLabel}.`
    ).catch((err) => console.error('co-renter/add: notification sms failed', err))
  }

  return NextResponse.json({ ok: true })
}
