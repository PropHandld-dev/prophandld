import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { canActForOwner } from '@/lib/pm'

// PATCH { status, note? }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const { data: row } = await admin.from('screening_requests').select('id, owner_user_id').eq('id', id).maybeSingle()
  if (!row || !(await canActForOwner(admin, user.id, row.owner_user_id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const b = (await request.json().catch(() => ({}))) as { status?: string; note?: string }
  if (!['invited', 'report_received', 'approved', 'declined', 'withdrawn'].includes(b.status || '')) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  await admin
    .from('screening_requests')
    .update({
      status: b.status,
      note: typeof b.note === 'string' ? b.note.trim().slice(0, 500) || null : undefined,
      decided_at: b.status === 'approved' || b.status === 'declined' ? new Date().toISOString() : null,
    })
    .eq('id', id)
  return NextResponse.json({ ok: true })
}
