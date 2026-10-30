import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'
import { loadChatParticipants } from '@/lib/chatParticipants'

export const maxDuration = 20

// Available to any of the three roles in a conversation — gated on
// whichever landlord is actually part of it (loadChatParticipants already
// resolves that for both job chat and DMs), same cross-role billing
// pattern as lease-qa and troubleshoot. 2-3 short quick replies for the
// most recent message, not sent automatically, just typed into the box.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { jobId, threadId } = (await request.json()) as { jobId?: string; threadId?: string }
  if (!jobId && !threadId) {
    return NextResponse.json({ error: 'Missing jobId or threadId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const resolved = await loadChatParticipants(supabaseAdmin, { jobId, threadId })
  const landlord = resolved?.participants.find((p) => p.role === 'landlord')
  if (!resolved || !resolved.participants.some((p) => p.userId === user.id) || !landlord) {
    return NextResponse.json({ replies: [] })
  }
  if (!(await hasAiAssistAccess(supabaseAdmin, landlord.userId))) {
    return NextResponse.json({ replies: [] })
  }
  // This is the highest-frequency AI check in the app (reruns on every
  // incoming chat message), so the ceiling is generous enough to never
  // trip during a genuinely active conversation — a backstop against a
  // scripted loop, not a usage cap.
  if (await tooManyAiAssistRequests('smart-replies', user.id, 60)) {
    return NextResponse.json({ replies: [] })
  }

  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('sender_user_id, body, created_at')
    .eq(jobId ? 'job_id' : 'thread_id', jobId || threadId)
    .order('created_at', { ascending: false })
    .limit(6)

  const recent = (messages || []).reverse()
  if (recent.length === 0 || recent[recent.length - 1].sender_user_id === user.id) {
    // Nothing to reply to, or I already sent the last message myself.
    return NextResponse.json({ replies: [] })
  }

  try {
    const result = await claudeJson<{ replies: string[] }>({
      system:
        'You suggest 2-3 short quick-reply options for someone about to respond in a property management app\'s ' +
        'chat, based on the recent messages. Each reply is from the perspective of whoever is about to send the ' +
        'next message (marked YOU below), responding to the other side\'s most recent message. Keep each option ' +
        'under 12 words, plain and natural, genuinely different from each other (not just rewordings).',
      prompt:
        'Recent messages (oldest first):\n' +
        recent.map((m) => `${m.sender_user_id === user.id ? 'YOU' : 'OTHER'}: ${m.body}`).join('\n') +
        '\n\nReturn JSON: { "replies": string[] } with 2-3 short options for what YOU might say next.',
      maxTokens: 200,
      track: { billedUserId: landlord.userId, callerUserId: user.id, feature: 'smart-replies' },
    })
    return NextResponse.json({ replies: (result.replies || []).slice(0, 3) })
  } catch (err) {
    if (err instanceof ClaudeConfigError) return NextResponse.json({ replies: [] })
    console.error('ai-assist/smart-replies: unhandled error', err)
    return NextResponse.json({ replies: [] })
  }
}
