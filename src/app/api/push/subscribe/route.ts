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

  // Actually subscribing this browser is itself an explicit opt-in — if the
  // account-level preference had been turned off before this (e.g. from
  // Settings, before ever granting browser permission), turn it back on
  // rather than leaving sendPush() silently dropping everything for an
  // account that just went through the trouble of enabling notifications.
  const { error: prefError } = await supabaseAdmin
    .from('users')
    .update({ push_notifications_enabled: true })
    .eq('id', user.id)
  if (prefError) console.error('push/subscribe: could not re-enable push preference', prefError)

  return NextResponse.json({ ok: true })
}

// Called on sign-out/delete-account (see profile/page.tsx) before the
// session itself goes away. Without this, a browser's push subscription
// row outlives the person who created it — on a shared device, whoever
// signs in next on that same browser still has the previous account's
// notifications (job updates, chat messages, rent reminders) land as OS
// notifications, visible on the lock screen/notification shade, since
// sendPush() looks up subscriptions purely by user_id with no liveness
// check. Deletes only the one row for THIS device's endpoint, not every
// subscription for the account — other devices that are still actually
// signed in should keep working.
export async function DELETE(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string }
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
    console.error('push/subscribe: error deleting subscription', error)
    return NextResponse.json({ error: 'Could not remove subscription' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
