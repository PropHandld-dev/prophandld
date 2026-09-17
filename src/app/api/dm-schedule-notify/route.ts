import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendDmScheduleEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { threadId, text, kind } = (await request.json()) as {
    threadId?: string
    text?: string
    kind?: 'proposed' | 'confirmed'
  }
  if (!threadId || !text || (kind !== 'proposed' && kind !== 'confirmed')) {
    return NextResponse.json({ error: 'Missing threadId, text, or kind' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: thread, error: threadError } = await supabaseAdmin
    .from('dm_threads')
    .select('landlord_user_id, other_user_id, other_role')
    .eq('id', threadId)
    .maybeSingle()

  if (threadError || !thread) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }
  if (user.id !== thread.landlord_user_id && user.id !== thread.other_user_id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const recipientId = user.id === thread.landlord_user_id ? thread.other_user_id : thread.landlord_user_id
  const recipientRole = user.id === thread.landlord_user_id ? thread.other_role : 'landlord'

  const [{ data: sender }, { data: recipient }] = await Promise.all([
    supabaseAdmin.from('users').select('full_name').eq('id', user.id).maybeSingle(),
    supabaseAdmin.from('users').select('email, full_name').eq('id', recipientId).maybeSingle(),
  ])

  if (!recipient?.email) {
    return NextResponse.json({ error: 'Recipient email not found' }, { status: 404 })
  }

  const result = await sendDmScheduleEmail({
    to: recipient.email,
    fromName: sender?.full_name || 'Someone',
    text,
    kind,
    role: recipientRole as 'landlord' | 'renter' | 'contractor',
    threadId,
  })

  if (!result.ok) {
    console.error('dm-schedule-notify: email failed', result.error)
    return NextResponse.json({ error: 'Could not send notification' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
