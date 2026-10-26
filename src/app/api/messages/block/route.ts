import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Deliberately client-UI-enforced, not a messages/dm_threads RLS change:
// those tables' live policies aren't in this repo (see
// scripts/2026-10-25-block-report-messaging.sql), so rather than blind-edit
// a policy nobody here can currently read, blocking works by filtering what
// a blocker sees (ChatPanel disables the composer, useConversations hides
// the thread) instead of trying to stop the other side's insert at the
// database layer. That's enough to satisfy "the ability to block abusive
// users" without risking an unreviewable change to existing RLS.

export async function GET(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = getSupabaseAdmin()
  const otherUserId = request.nextUrl.searchParams.get('otherUserId')

  if (otherUserId) {
    const [{ data: byMe }, { data: ofMe }] = await Promise.all([
      admin.from('blocked_users').select('id').eq('blocker_user_id', user.id).eq('blocked_user_id', otherUserId).maybeSingle(),
      admin.from('blocked_users').select('id').eq('blocker_user_id', otherUserId).eq('blocked_user_id', user.id).maybeSingle(),
    ])
    return NextResponse.json({ blockedByMe: !!byMe, blockedMe: !!ofMe })
  }

  const { data } = await admin.from('blocked_users').select('blocked_user_id').eq('blocker_user_id', user.id)
  return NextResponse.json({ blockedUserIds: (data || []).map((r) => r.blocked_user_id) })
}

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { otherUserId } = (await request.json()) as { otherUserId?: string }
  if (!otherUserId || typeof otherUserId !== 'string') {
    return NextResponse.json({ error: 'otherUserId is required' }, { status: 400 })
  }
  if (otherUserId === user.id) {
    return NextResponse.json({ error: "You can't block yourself" }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from('blocked_users')
    .upsert({ blocker_user_id: user.id, blocked_user_id: otherUserId }, { onConflict: 'blocker_user_id,blocked_user_id' })
  if (error) {
    console.error('messages/block: insert failed', error)
    return NextResponse.json({ error: 'Could not block this person' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { otherUserId } = (await request.json()) as { otherUserId?: string }
  if (!otherUserId || typeof otherUserId !== 'string') {
    return NextResponse.json({ error: 'otherUserId is required' }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from('blocked_users')
    .delete()
    .eq('blocker_user_id', user.id)
    .eq('blocked_user_id', otherUserId)
  if (error) {
    console.error('messages/block: delete failed', error)
    return NextResponse.json({ error: 'Could not unblock this person' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
