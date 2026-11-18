import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// DELETE: remove your own message, or withdraw your own approval request
// while it's still waiting. Decided approvals stay on record.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const { data: msg } = await admin.from('pm_owner_messages').select('id, sender_user_id, kind, action_status').eq('id', messageId).maybeSingle()
  if (!msg || msg.sender_user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (msg.kind === 'approval' && msg.action_status !== 'pending') {
    return NextResponse.json({ error: 'A decided approval stays on record.' }, { status: 409 })
  }
  const { error } = await admin.from('pm_owner_messages').delete().eq('id', messageId).eq('sender_user_id', user.id)
  if (error) return NextResponse.json({ error: 'Could not delete. Try again.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
