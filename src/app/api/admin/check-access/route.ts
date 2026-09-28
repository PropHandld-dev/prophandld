import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { isAdminUserId } from '@/lib/adminAccess'

// admin_users has no client-readable RLS policy on purpose (service-role
// only, same as every other admin-only table) — so AdminLayout can't query
// it directly the way the old email-domain check didn't need to. This is
// the one narrow read it's allowed: "is the calling user themself an
// admin", nothing else about the table is exposed.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ authorized: false })
  }
  const authorized = await isAdminUserId(user.id)
  return NextResponse.json({ authorized })
}
