import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { loadChatParticipants } from '@/lib/chatParticipants'

// Who is in this conversation, with names, so the chat can label every
// message and show "With …". Only people in the conversation may ask.
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
  if (!loaded || !loaded.participants.some((p) => p.userId === user.id)) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const { data: people } = await admin
    .from('users')
    .select('id, full_name')
    .in('id', loaded.participants.map((p) => p.userId))
  const nameById = new Map((people || []).map((u: any) => [u.id, u.full_name as string | null]))

  return NextResponse.json({
    participants: loaded.participants.map((p) => ({ role: p.role, user_id: p.userId, full_name: nameById.get(p.userId) ?? null })),
  })
}
