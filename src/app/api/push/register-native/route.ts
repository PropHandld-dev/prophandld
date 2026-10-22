import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Saves a native FCM (Android) / APNs (iOS) token — the native-app twin of
// api/push/subscribe, which only ever handles web-push subscriptions. See
// NativePushRegistration.tsx for the client side and sendPush() in
// lib/push.ts for where this actually gets used to deliver a push.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { token, platform } = (await request.json().catch(() => ({}))) as { token?: string; platform?: string }
  if (!token || (platform !== 'ios' && platform !== 'android')) {
    return NextResponse.json({ error: 'Invalid token or platform' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  // onConflict targets the partial unique index on native_token — a
  // reinstall or a token Apple/Google rotates lands on the same row
  // instead of accumulating duplicate rows that would each get a push.
  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, platform, native_token: token, endpoint: `native:${platform}:${token}` },
      { onConflict: 'native_token' }
    )

  if (error) {
    console.error('push/register-native: error saving token', error)
    return NextResponse.json({ error: 'Could not save token' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// Mirrors api/push/subscribe's DELETE — called on sign-out/delete-account
// (profile/page.tsx) so a shared device signing out doesn't keep
// surfacing the previous account's native push notifications, same
// reasoning as the web-push cleanup this was modeled on.
export async function DELETE(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { token } = (await request.json().catch(() => ({}))) as { token?: string }
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('native_token', token)

  if (error) {
    console.error('push/register-native: error deleting token', error)
    return NextResponse.json({ error: 'Could not remove token' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
