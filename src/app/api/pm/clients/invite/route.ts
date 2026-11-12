import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership } from '@/lib/pm'
import { sendPmClientInviteEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'
import { tooManyRequests } from '@/lib/rateLimit'

export const maxDuration = 20

const RATE_LIMIT = 5
const RATE_WINDOW_MINUTES = 1

// Mirrors /api/co-owner/invite closely: existing-landlord-account-only
// for v1 (no "invite someone who doesn't have an account yet" path —
// that's a real product decision about whether a PM can originate a
// brand-new owner account, left for a later pass), email-based lookup,
// rate-limited the same way since this also reaches a whole portfolio.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const membership = await getPmMembership(supabaseAdmin, user.id)
  if (!membership || membership.memberRole !== 'admin') {
    return NextResponse.json({ error: 'Only a PM organization admin can invite clients' }, { status: 403 })
  }

  if (await tooManyRequests(`pm-client-invite:${user.id}`, RATE_LIMIT, RATE_WINDOW_MINUTES)) {
    return NextResponse.json({ error: 'Too many invites sent, try again shortly' }, { status: 429 })
  }

  const { email } = (await request.json().catch(() => ({}))) as { email?: string }
  const ownerEmail = email?.trim().toLowerCase()
  if (!ownerEmail) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }

  const { data: existingUserId } = await supabaseAdmin.rpc('get_user_id_by_email', { email_input: ownerEmail })
  if (!existingUserId) {
    return NextResponse.json({ error: 'no_account_found' }, { status: 404 })
  }

  const { data: existingAuthUser } = await supabaseAdmin.auth.admin.getUserById(existingUserId)
  const existingRole = existingAuthUser?.user?.app_metadata?.role
  if (existingRole !== 'landlord') {
    return NextResponse.json(
      { error: `This email already has a Prophandld account (as a ${existingRole || 'different role'}), so it can't be added as a client.` },
      { status: 400 }
    )
  }
  if (existingUserId === user.id) {
    return NextResponse.json({ error: "You can't invite yourself." }, { status: 400 })
  }

  const { error: insertError } = await supabaseAdmin
    .from('pm_client_portfolios')
    .insert({ organization_id: membership.organizationId, owner_user_id: existingUserId })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'already_invited_or_managed' }, { status: 400 })
    }
    console.error('pm/clients/invite: insert failed', insertError)
    return NextResponse.json({ error: 'Could not send the invite. That account may already be managed by another PM.' }, { status: 500 })
  }

  const { data: inviteeRow } = await supabaseAdmin
    .from('users')
    .select('email, full_name, preferred_language, email_notifications_enabled')
    .eq('id', existingUserId)
    .maybeSingle()
  const inviteeLang = inviteeRow?.preferred_language === 'es' ? 'es' : 'en'

  await Promise.all([
    inviteeRow?.email && emailAllowed(inviteeRow)
      ? sendPmClientInviteEmail({ to: inviteeRow.email, pmOrgName: membership.organizationName, lang: inviteeLang }).catch((err) =>
          console.error('pm/clients/invite: notification email failed', err)
        )
      : Promise.resolve(),
    sendPush(existingUserId, {
      title: 'Property management invite',
      body: `${membership.organizationName} invited you to let them manage your property.`,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord`,
    }).catch((err) => console.error('pm/clients/invite: notification push failed', err)),
  ])

  return NextResponse.json({ ok: true })
}
