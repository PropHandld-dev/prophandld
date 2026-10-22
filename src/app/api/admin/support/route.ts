import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const [{ data: rows, error }, { data: eventRows, error: eventError }] = await Promise.all([
    supabaseAdmin.from('support_escalations').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('event_interest').select('*').order('created_at', { ascending: false }),
  ])

  if (error) {
    console.error('admin/support: error loading rows', error)
    return NextResponse.json({ error: 'Could not load questions' }, { status: 500 })
  }
  if (eventError) {
    console.error('admin/support: error loading event interest', eventError)
  }

  const resolverIds = Array.from(new Set((rows || []).map((r) => r.resolved_by).filter(Boolean)))
  const { data: resolvers } = resolverIds.length
    ? await supabaseAdmin.from('users').select('id, full_name, email').in('id', resolverIds)
    : { data: [] as any[] }
  const byId = new Map((resolvers || []).map((r: any) => [r.id, r]))

  return NextResponse.json({
    rows: (rows || []).map((r) => ({
      ...r,
      resolvedByName: r.resolved_by ? byId.get(r.resolved_by)?.full_name || byId.get(r.resolved_by)?.email || null : null,
    })),
    eventInterest: eventRows || [],
  })
}
