import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 15

// Powers the Profile page's "Co-owners" card: who this landlord has
// invited (or been invited by), and whether the caller is themselves an
// accepted co-owner (in which case the invite form shouldn't render —
// a co-owner has no portfolio of their own to invite into).
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()

  const [{ data: asPrimary }, { data: asCoOwner }] = await Promise.all([
    admin
      .from('landlord_co_owners')
      .select('id, co_owner_user_id, invited_email, status, invited_at, accepted_at')
      .eq('primary_landlord_user_id', user.id)
      .order('invited_at', { ascending: false }),
    admin
      .from('landlord_co_owners')
      .select('id, primary_landlord_user_id, status, invited_at, accepted_at')
      .eq('co_owner_user_id', user.id)
      .order('invited_at', { ascending: false }),
  ])

  const coOwnerIds = (asPrimary || []).map((r) => r.co_owner_user_id).filter(Boolean) as string[]
  const primaryIds = (asCoOwner || []).map((r) => r.primary_landlord_user_id)
  const nameIds = Array.from(new Set([...coOwnerIds, ...primaryIds]))
  const { data: people } = nameIds.length
    ? await admin.from('users').select('id, full_name, email').in('id', nameIds)
    : { data: [] as any[] }
  const byId = new Map((people || []).map((p: any) => [p.id, p]))

  return NextResponse.json({
    invitedByMe: (asPrimary || []).map((r) => ({
      id: r.id,
      status: r.status,
      invitedAt: r.invited_at,
      acceptedAt: r.accepted_at,
      name: r.co_owner_user_id ? byId.get(r.co_owner_user_id)?.full_name || byId.get(r.co_owner_user_id)?.email || 'Pending' : r.invited_email,
      pendingSignup: !r.co_owner_user_id,
    })),
    iAmCoOwnerOf: (asCoOwner || []).map((r) => ({
      id: r.id,
      status: r.status,
      invitedAt: r.invited_at,
      acceptedAt: r.accepted_at,
      name: byId.get(r.primary_landlord_user_id)?.full_name || byId.get(r.primary_landlord_user_id)?.email || 'A landlord',
    })),
  })
}
