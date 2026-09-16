import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { endpoint } = (await request.json()) as { endpoint?: string }
  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)

  if (error) {
    console.error('push/unsubscribe: error removing subscription', error)
    return NextResponse.json({ error: 'Could not remove subscription' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
