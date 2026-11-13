import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { logAdminAudit } from '@/lib/auditLog'

export const maxDuration = 15

// Emergency kill switch: force a public profile/directory listing off
// without needing the org's own admin to do it (a fraudulent listing or
// an abusive pitch needs to come down immediately, not wait on whoever
// runs that company). Doesn't touch any client relationship or data --
// only the public-facing visibility flag.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { openToClients } = (await request.json().catch(() => ({}))) as { openToClients?: boolean }
  if (typeof openToClients !== 'boolean') {
    return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: org, error } = await admin
    .from('pm_organizations')
    .update({ open_to_clients: openToClients })
    .eq('id', organizationId)
    .select('name, admin_user_id')
    .maybeSingle()

  if (error || !org) {
    return NextResponse.json({ error: 'Could not update that organization' }, { status: 500 })
  }

  await logAdminAudit({
    actionType: 'pm_profile_delisted',
    actorUserId: user.id,
    actorEmail: user.email,
    targetUserId: org.admin_user_id,
    targetRole: 'landlord',
    detail: { organizationId, orgName: org.name, openToClients },
  })

  return NextResponse.json({ ok: true })
}
