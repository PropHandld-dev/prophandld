import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { loadChatParticipants } from '@/lib/chatParticipants'

export const maxDuration = 20

type PreviewRow = { kind: 'job' | 'dm'; conv_id: string; body: string; created_at: string; sender_user_id: string }

// SECURITY FIX (external audit, 2026-11-06, PRIV-01): useConversations.ts
// used to call get_recent_conversation_previews() straight from the
// browser's own client and trust its rows completely — the inbox list,
// search, and unread counts all came from that one call. Its own
// assumption (see useConversations.ts's old comment) was that the
// `messages` table's RLS SELECT policy already restricts results to real
// participants, which is exactly the assumption the messaging-privacy fix
// (d1054cf) proved false for the single-thread fetch. This RPC was never
// updated to match, so a non-participant contractor's inbox and search
// still surfaced previews from conversations they weren't in, even after
// the detail page correctly denied opening them.
//
// Still calls the RPC exactly as before (so whatever it's actually
// supposed to approximate keeps working), but now treats its rows as
// unverified candidates: each one is re-checked here against
// loadChatParticipants, the same authorization helper /api/chat/messages
// and /api/chat/participants already rely on, before ever reaching the
// client. A non-member's row is silently dropped rather than trusted.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: previews, error } = await authClient.rpc('get_recent_conversation_previews')
  if (error) {
    console.error('chat/inbox-previews: RPC failed', error)
    return NextResponse.json({ error: 'Could not load conversations' }, { status: 500 })
  }

  const rows = (previews || []) as PreviewRow[]
  const admin = getSupabaseAdmin()

  const checks = await Promise.all(
    rows.map((row) =>
      loadChatParticipants(admin, row.kind === 'job' ? { jobId: row.conv_id } : { threadId: row.conv_id })
    )
  )

  const verified = rows.filter((row, i) => {
    const loaded = checks[i]
    return !!loaded && loaded.participants.some((p) => p.userId === user.id)
  })

  return NextResponse.json({ previews: verified })
}
