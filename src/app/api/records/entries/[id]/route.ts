import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { canActForOwner } from '@/lib/pm'

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const { data: row } = await admin.from('ledger_entries').select('id, owner_user_id').eq('id', id).maybeSingle()
  if (!row || !(await canActForOwner(admin, user.id, row.owner_user_id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await admin.from('ledger_entries').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
