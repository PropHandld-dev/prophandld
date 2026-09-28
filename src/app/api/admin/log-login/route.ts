import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { isAdminUserId } from '@/lib/adminAccess'
import { logAdminAudit } from '@/lib/auditLog'

// Called once by /admin/login right after MFA clears — "who accessed the
// admin panel, when" is standard practice for anything with this much
// visibility into the business, and pairs naturally with the MFA work.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await isAdminUserId(user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  await logAdminAudit({ actionType: 'admin_login', actorUserId: user.id, actorEmail: user.email })
  return NextResponse.json({ ok: true })
}
