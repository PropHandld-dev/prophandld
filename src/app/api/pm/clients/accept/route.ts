import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendPmClientAcceptedEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'

export const maxDuration = 20

// The owner's own accept step, same reasoning as /api/co-owner/accept:
// run as a real route (not a bare client-side RLS update) so the PM
// admin's "they accepted" email/push can go out in the same request.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { portfolioId } = (await request.json().catch(() => ({}))) as { portfolioId?: string }
  if (!portfolioId) {
    return NextResponse.json({ error: 'Missing portfolioId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: updated, error } = await supabaseAdmin
    .from('pm_client_portfolios')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', portfolioId)
    .eq('owner_user_id', user.id)
    .eq('status', 'pending')
    .select('organization_id, pm_organizations(admin_user_id, name)')
    .maybeSingle()

  if (error || !updated) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  const org = updated.pm_organizations as any
  const [{ data: adminRow }, { data: ownerRow }] = await Promise.all([
    supabaseAdmin.from('users').select('email, full_name, preferred_language, email_notifications_enabled').eq('id', org.admin_user_id).maybeSingle(),
    supabaseAdmin.from('users').select('full_name').eq('id', user.id).maybeSingle(),
  ])
  const adminLang = adminRow?.preferred_language === 'es' ? 'es' : 'en'

  await Promise.all([
    adminRow?.email && emailAllowed(adminRow)
      ? sendPmClientAcceptedEmail({ to: adminRow.email, ownerName: ownerRow?.full_name || 'A client', lang: adminLang }).catch((err) =>
          console.error('pm/clients/accept: notification email failed', err)
        )
      : Promise.resolve(),
    sendPush(org.admin_user_id, {
      title: 'New client accepted',
      body: `${ownerRow?.full_name || 'A client'} accepted your invite.`,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord/pm`,
    }).catch((err) => console.error('pm/clients/accept: notification push failed', err)),
  ])

  return NextResponse.json({ ok: true })
}
