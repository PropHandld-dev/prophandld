import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { loadChatParticipants } from '@/lib/chatParticipants'
import { requireAdminAal2 } from '@/lib/adminAccess'

// SECURITY FIX — confirmed live by an external audit: a contractor who
// was not a participant in a direct-message thread (just an ordinary
// contractor with some other, unrelated relationship to the same
// landlord) could still read its full message bodies by opening its URL
// directly. ChatPanel used to query the `messages` table straight from
// the browser's own authenticated client, trusting the table's RLS
// SELECT policy alone to restrict which thread_id-scoped rows come
// back — exactly the kind of gap already found and fixed the same way
// for job access_notes: the real fix doesn't depend on that policy
// being correct. This route reuses loadChatParticipants, the same
// authorization helper /api/chat/participants already relies on (so
// participants and messages are now guaranteed to agree on who's
// allowed to see what), and only ever queries `messages` through the
// admin client after that check passes.
export async function GET(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const jobId = request.nextUrl.searchParams.get('jobId')
  const threadId = request.nextUrl.searchParams.get('threadId')
  if (!jobId && !threadId) {
    return NextResponse.json({ error: 'Missing jobId or threadId' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const loaded = await loadChatParticipants(admin, { jobId, threadId })
  if (!loaded) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const isMember = loaded.participants.some((p) => p.userId === user.id)
  const isAdmin = !isMember && (await requireAdminAal2(authClient, user.id))
  if (!isMember && !isAdmin) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const { data: messages, error } = await admin
    .from('messages')
    .select('id, job_id, thread_id, sender_user_id, body, created_at')
    .eq(jobId ? 'job_id' : 'thread_id', jobId || threadId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('chat/messages: query failed', error)
    return NextResponse.json({ error: 'Could not load messages' }, { status: 500 })
  }

  return NextResponse.json({ messages: messages || [] })
}
