import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendPmClientRequestEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'
import { tooManyRequests } from '@/lib/rateLimit'

export const maxDuration = 20

// The reverse of /api/pm/clients/invite: a landlord, browsing a PM's
// public profile, asks THEM to take over instead of waiting to be
// invited. Same row shape (pm_client_portfolios, status 'pending'), just
// requested_by: 'owner' instead of the default 'pm', so both dashboards
// know which side owes the other an Accept/Decline.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only a landlord account can request a property manager' }, { status: 403 })
  }

  if (await tooManyRequests(`pm-client-request:${user.id}`, 5, 1)) {
    return NextResponse.json({ error: 'Too many requests sent, try again shortly' }, { status: 429 })
  }

  const { slug } = (await request.json().catch(() => ({}))) as { slug?: string }
  if (!slug) {
    return NextResponse.json({ error: 'Missing company' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  const { data: org } = await admin
    .from('pm_organizations')
    .select('id, name, admin_user_id')
    .eq('slug', slug)
    .eq('open_to_clients', true)
    .maybeSingle()

  if (!org) {
    return NextResponse.json({ error: 'That property manager was not found' }, { status: 404 })
  }
  // Same self-request guard /api/pm/clients/invite already has for the
  // other direction -- without it, a PM admin hitting their own public
  // profile link (easy to do by accident while testing it) could request
  // their own company manage them.
  if (org.admin_user_id === user.id) {
    return NextResponse.json({ error: "You can't request your own company." }, { status: 400 })
  }

  const { error: insertError } = await admin
    .from('pm_client_portfolios')
    .insert({ organization_id: org.id, owner_user_id: user.id, requested_by: 'owner' })

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'already_requested_or_managed' }, { status: 400 })
    }
    console.error('pm/clients/request: insert failed', insertError)
    return NextResponse.json({ error: 'Could not send that request' }, { status: 500 })
  }

  const [{ data: adminRow }, { data: ownerRow }] = await Promise.all([
    admin.from('users').select('email, full_name, preferred_language, email_notifications_enabled').eq('id', org.admin_user_id).maybeSingle(),
    admin.from('users').select('full_name').eq('id', user.id).maybeSingle(),
  ])
  const adminLang = adminRow?.preferred_language === 'es' ? 'es' : 'en'
  const ownerName = ownerRow?.full_name || 'A landlord'

  await Promise.all([
    adminRow?.email && emailAllowed(adminRow)
      ? sendPmClientRequestEmail({ to: adminRow.email, ownerName, lang: adminLang }).catch((err) =>
          console.error('pm/clients/request: notification email failed', err)
        )
      : Promise.resolve(),
    sendPush(org.admin_user_id, {
      title: 'New management request',
      body: `${ownerName} wants you to manage their property.`,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord/pm`,
    }).catch((err) => console.error('pm/clients/request: notification push failed', err)),
  ])

  return NextResponse.json({ ok: true })
}
