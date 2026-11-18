import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logPmAction } from '@/lib/pm'
import { notifyUser } from '@/lib/notifyUser'

export const maxDuration = 15

// POST { messageId, decision: 'approved' | 'declined' } — owner only.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const { messageId, decision } = (await request.json().catch(() => ({}))) as { messageId?: string; decision?: string }
  if (!messageId || (decision !== 'approved' && decision !== 'declined')) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { data: msg } = await admin
    .from('pm_owner_messages')
    .select('id, organization_id, owner_user_id, sender_user_id, kind, action, action_status, pm_organizations(admin_user_id, name)')
    .eq('id', messageId)
    .maybeSingle()
  if (!msg || msg.kind !== 'approval' || msg.owner_user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only from pending, so a double tap or a second device can't flip it.
  const { data: updated } = await admin
    .from('pm_owner_messages')
    .update({ action_status: decision, decided_by: user.id, decided_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('action_status', 'pending')
    .select('id')
  if (!updated || updated.length === 0) return NextResponse.json({ error: 'This was already decided' }, { status: 409 })

  const action = (msg.action || {}) as any
  const { data: owner } = await admin.from('users').select('full_name').eq('id', user.id).maybeSingle()
  const ownerName = owner?.full_name || 'Your client'
  const recipients = Array.from(new Set([msg.sender_user_id, (msg as any).pm_organizations?.admin_user_id].filter(Boolean)))
  for (const r of recipients) {
    await notifyUser(admin, r, {
      title: `${ownerName} ${decision === 'approved' ? 'approved' : 'declined'}`,
      body: `${action.title}${action.amount ? ` · $${Number(action.amount).toFixed(2)}` : ''}`,
      url: `/landlord/pm?thread=${user.id}`,
      critical: true,
      sms: `${ownerName} ${decision} ${action.title}.`,
      email: {
        subject: `${ownerName} ${decision} your request`,
        eyebrow: decision === 'approved' ? 'Approved' : 'Declined',
        heading: action.title,
        body: decision === 'approved' && action.type === 'job_payment' ? 'You can now pay this job from the job page.' : `${ownerName} ${decision} this request.`,
        ctaLabel: action.jobId ? 'Open job' : 'Open conversation',
      },
    })
  }
  await logPmAction(admin, {
    organizationId: msg.organization_id,
    ownerUserId: user.id,
    actorUserId: user.id,
    action: decision === 'approved' ? 'owner_action_approved' : 'owner_action_declined',
    jobId: action.jobId,
    bidId: action.bidId,
    amount: action.amount || undefined,
    detail: action.title,
  }).catch(() => {})
  return NextResponse.json({ ok: true })
}
