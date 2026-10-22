import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { id, resolved } = (await request.json().catch(() => ({}))) as { id?: string; resolved?: boolean }
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('support_escalations')
    .update(
      resolved === false
        ? { resolved_at: null, resolved_by: null }
        : { resolved_at: new Date().toISOString(), resolved_by: user.id }
    )
    .eq('id', id)

  if (error) {
    console.error('admin/support/resolve: update failed', error)
    return NextResponse.json({ error: 'Could not update' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
