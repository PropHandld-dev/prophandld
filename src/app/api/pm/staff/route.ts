import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership } from '@/lib/pm'
import { sendPmStaffInviteEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'
import { tooManyRequests } from '@/lib/rateLimit'

export const maxDuration = 20

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const membership = await getPmMembership(supabaseAdmin, user.id)
  if (!membership) {
    return NextResponse.json({ error: 'Not a property management org member' }, { status: 403 })
  }

  const { data: members } = await supabaseAdmin
    .from('pm_organization_members')
    .select('id, user_id, invited_email, member_role, can_view_financials, status, invited_at, accepted_at, users(full_name, email)')
    .eq('organization_id', membership.organizationId)
    .order('invited_at', { ascending: false })

  return NextResponse.json({
    staff: (members || []).map((m: any) => ({
      id: m.id,
      userId: m.user_id,
      name: m.users?.full_name || m.invited_email || m.users?.email || 'Unknown',
      memberRole: m.member_role,
      canViewFinancials: m.can_view_financials,
      status: m.status,
      invitedAt: m.invited_at,
      acceptedAt: m.accepted_at,
    })),
  })
}

// Only an Admin can invite staff. Same existing-landlord-account-only
// shape as the client invite, same reasoning.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const membership = await getPmMembership(supabaseAdmin, user.id)
  if (!membership || membership.memberRole !== 'admin') {
    return NextResponse.json({ error: 'Only a PM organization admin can invite staff' }, { status: 403 })
  }

  if (await tooManyRequests(`pm-staff-invite:${user.id}`, 5, 1)) {
    return NextResponse.json({ error: 'Too many invites sent, try again shortly' }, { status: 429 })
  }

  const { email, canViewFinancials } = (await request.json().catch(() => ({}))) as { email?: string; canViewFinancials?: boolean }
  const staffEmail = email?.trim().toLowerCase()
  if (!staffEmail) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }

  const { data: existingUserId } = await supabaseAdmin.rpc('get_user_id_by_email', { email_input: staffEmail })
  if (!existingUserId) {
    return NextResponse.json({ error: 'no_account_found' }, { status: 404 })
  }
  if (existingUserId === user.id) {
    return NextResponse.json({ error: "You can't invite yourself." }, { status: 400 })
  }

  const { data: existingAuthUser } = await supabaseAdmin.auth.admin.getUserById(existingUserId)
  const existingRole = existingAuthUser?.user?.app_metadata?.role
  if (existingRole !== 'landlord') {
    return NextResponse.json(
      { error: `This email already has a Prophandld account (as a ${existingRole || 'different role'}), so it can't be added as staff.` },
      { status: 400 }
    )
  }

  const { error: insertError } = await supabaseAdmin.from('pm_organization_members').insert({
    organization_id: membership.organizationId,
    user_id: existingUserId,
    member_role: 'staff',
    can_view_financials: !!canViewFinancials,
  })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'already_invited_or_on_a_team' }, { status: 400 })
    }
    console.error('pm/staff: insert failed', insertError)
    return NextResponse.json({ error: 'Could not send the invite. That account may already be on another team.' }, { status: 500 })
  }

  const { data: inviteeRow } = await supabaseAdmin
    .from('users')
    .select('email, preferred_language, email_notifications_enabled')
    .eq('id', existingUserId)
    .maybeSingle()
  const inviteeLang = inviteeRow?.preferred_language === 'es' ? 'es' : 'en'

  await Promise.all([
    inviteeRow?.email && emailAllowed(inviteeRow)
      ? sendPmStaffInviteEmail({ to: inviteeRow.email, pmOrgName: membership.organizationName, lang: inviteeLang }).catch((err) =>
          console.error('pm/staff: notification email failed', err)
        )
      : Promise.resolve(),
    sendPush(existingUserId, {
      title: 'Team invite',
      body: `${membership.organizationName} invited you to join their team.`,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord`,
    }).catch((err) => console.error('pm/staff: notification push failed', err)),
  ])

  return NextResponse.json({ ok: true })
}
