import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getLinkedProfiles, ALL_ROLES } from '@/lib/linkedProfiles'

export const maxDuration = 15

// Powers the Profile page's "Your profiles" card: the linked profiles
// (if any) plus which roles are still available to add.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const linked = await getLinkedProfiles(admin, user.id)
  const currentRole = user.app_metadata?.role
  const takenRoles = new Set([currentRole, ...linked.map((p) => p.role)])
  const availableRoles = ALL_ROLES.filter((r) => !takenRoles.has(r))

  return NextResponse.json({ linked, availableRoles })
}
