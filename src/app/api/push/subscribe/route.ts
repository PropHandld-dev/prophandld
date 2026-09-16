import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { endpoint, keys } = (await request.json()) as {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
  }

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, endpoint, p256dh: keys.p256dh, auth_key: keys.auth },
      { onConflict: 'endpoint' }
    )

  if (error) {
    console.error('push/subscribe: error saving subscription', error)
    return NextResponse.json({ error: 'Could not save subscription' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
