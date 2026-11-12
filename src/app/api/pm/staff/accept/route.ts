import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 20

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { memberId } = (await request.json().catch(() => ({}))) as { memberId?: string }
  if (!memberId) {
    return NextResponse.json({ error: 'Missing memberId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: updated, error } = await supabaseAdmin
    .from('pm_organization_members')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error || !updated) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
