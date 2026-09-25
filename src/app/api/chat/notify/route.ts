import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendChatMessageEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { loadChatParticipants } from '@/lib/chatParticipants'

type Role = 'landlord' | 'renter' | 'contractor'

const SITE = 'https://www.prophandld.com'
const BURST_WINDOW_MS = 10 * 60 * 1000

// Tells the other people in a chat that a message arrived. Everyone gets a
// push; the email goes out only for the first message of a burst (nothing
// from the same sender in the last 10 minutes), so a back-and-forth doesn't
// fill anyone's inbox.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { messageId } = (await request.json()) as { messageId?: string }
  if (!messageId) {
    return NextResponse.json({ error: 'Missing messageId' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  const { data: message } = await admin
    .from('messages')
    .select('id, job_id, thread_id, sender_user_id, body, created_at')
    .eq('id', messageId)
    .maybeSingle()

  if (!message || message.sender_user_id !== user.id) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  const loaded = await loadChatParticipants(admin, { jobId: message.job_id, threadId: message.thread_id })
  if (!loaded) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

  // Only people in the conversation may trigger alerts about it.
  if (!loaded.participants.some((p) => p.userId === user.id)) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  const context = loaded.context
  const buildLink = (role: Role) => `${SITE}${loaded.path(role)}`
  const recipients = loaded.participants.filter((p) => p.userId !== user.id)

  const { data: sender } = await admin.from('users').select('full_name').eq('id', user.id).maybeSingle()
  const senderName = sender?.full_name || 'Someone'
  const preview = String(message.body).slice(0, 140)

  // First message of a burst? (Nothing from this sender in this chat in the last 10 minutes.)
  const column = message.job_id ? 'job_id' : 'thread_id'
  const { data: recent } = await admin
    .from('messages')
    .select('id')
    .eq(column, message.job_id || message.thread_id)
    .eq('sender_user_id', user.id)
    .lt('created_at', message.created_at)
    .gte('created_at', new Date(Date.parse(message.created_at) - BURST_WINDOW_MS).toISOString())
    .limit(1)
  const sendEmailToo = !recent || recent.length === 0

  await Promise.allSettled(
    recipients.map(async ({ userId, role }) => {
      const url = buildLink(role)
      // Just the name: the phone's own notification chrome already stamps
      // "from Prophandld" onto every banner on its own (it can't be
      // suppressed, by design), so a title of "Message from X" reads back
      // as "Message from X from Prophandld" — doubled and awkward.
      await sendPush(userId, { title: senderName, body: preview, url }).catch((err) =>
        console.error('chat/notify: push failed', { userId, err })
      )
      if (!sendEmailToo) return
      const { data: recipient } = await admin.from('users').select('email').eq('id', userId).maybeSingle()
      if (recipient?.email) {
        await sendChatMessageEmail({ to: recipient.email, senderName, context, preview, ctaUrl: url })
      }
    })
  )

  return NextResponse.json({ ok: true, notified: recipients.length, emailed: sendEmailToo })
}
