import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendMessageReportedAdminEmail } from '@/lib/email'

const REASONS = ['harassment', 'spam', 'inappropriate', 'scam_or_fraud', 'other'] as const

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { messageId, jobId, threadId, reportedUserId, reason, note } = (await request.json()) as {
    messageId?: string
    jobId?: string
    threadId?: string
    reportedUserId?: string
    reason?: string
    note?: string
  }
  if (!reportedUserId || !reason || !REASONS.includes(reason as (typeof REASONS)[number])) {
    return NextResponse.json({ error: 'reportedUserId and a valid reason are required' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  let messageBody: string | null = null
  if (messageId) {
    const { data: messageRow } = await admin.from('messages').select('body').eq('id', messageId).maybeSingle()
    messageBody = messageRow?.body || null
  }

  const { error: insertError } = await admin.from('reported_messages').insert({
    message_id: messageId || null,
    job_id: jobId || null,
    thread_id: threadId || null,
    reporter_user_id: user.id,
    reported_user_id: reportedUserId,
    reason,
    note: note?.trim() || null,
  })
  if (insertError) {
    console.error('messages/report: insert failed', insertError)
    return NextResponse.json({ error: 'Could not submit this report' }, { status: 500 })
  }

  const [{ data: reporterRow }, { data: reportedRow }] = await Promise.all([
    admin.from('users').select('email').eq('id', user.id).maybeSingle(),
    admin.from('users').select('email').eq('id', reportedUserId).maybeSingle(),
  ])

  await sendMessageReportedAdminEmail({
    reporterEmail: reporterRow?.email || user.email || 'unknown',
    reportedEmail: reportedRow?.email || 'unknown',
    reason,
    note,
    contextLabel: jobId ? `job ${jobId}` : threadId ? `DM thread ${threadId}` : 'a conversation',
    messageBody,
  }).catch((err) => console.error('messages/report: admin email failed', err))

  return NextResponse.json({ ok: true })
}
