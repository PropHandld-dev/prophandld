import webpush from 'web-push'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { isPreviewDeployment } from '@/lib/env'
import { sendFcmPush } from '@/lib/fcm'
import { sendApnsPush } from '@/lib/apns'

let configured = false

function ensureConfigured() {
  if (configured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = (process.env.VAPID_SUBJECT || 'mailto:admin@prophandld.com').trim()
  if (publicKey && privateKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey)
  }
  configured = true
}

export async function sendPush(
  userId: string,
  { title, body, url, tag, urgent }: { title: string; body: string; url?: string; tag?: string; urgent?: boolean }
) {
  if (isPreviewDeployment()) return
  // Each rail (web-push, FCM, APNs) gates itself on its own env vars
  // inside its own send call below — no single early return here, since
  // a user could have a native subscription even on a deploy where web
  // push was never configured, or vice versa.
  ensureConfigured()

  const supabaseAdmin = getSupabaseAdmin()

  // The one central gate for every push send in the app — checked here,
  // once, rather than at each of the 15+ call sites, so a preference
  // change takes effect immediately everywhere with nothing else to keep
  // in sync. Defaults to allowed (true) if the column is somehow null,
  // same as the column's own DB default.
  const { data: prefRow } = await supabaseAdmin
    .from('users')
    .select('push_notifications_enabled')
    .eq('id', userId)
    .maybeSingle()
  if (prefRow?.push_notifications_enabled === false) return

  const { data: subscriptions, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key, platform, native_token')
    .eq('user_id', userId)

  if (error) {
    console.error('sendPush: error fetching subscriptions', { userId, error })
    return
  }
  if (!subscriptions || subscriptions.length === 0) return

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      // Native subscriptions (iOS/Android wrapper apps) — web-push doesn't
      // function inside a Capacitor WebView at all, so these go through
      // FCM/APNs instead. See NativePushRegistration.tsx for how a device
      // ends up with one of these rows.
      if (sub.platform === 'android' && sub.native_token) {
        const result = await sendFcmPush(sub.native_token, { title, body, url })
        if (result.invalid) await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
        return
      }
      if (sub.platform === 'ios' && sub.native_token) {
        const result = await sendApnsPush(sub.native_token, { title, body, url })
        if (result.invalid) await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
        return
      }

      if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh!, auth: sub.auth_key! },
          },
          JSON.stringify({ title, body, url: url || '/', tag }),
          // iOS's "Time Sensitive" level (the one that breaks through Focus/Do
          // Not Disturb) is only available to native apps — there's no web-push
          // equivalent. "high" urgency is the real lever the web push standard
          // gives us: it tells the phone's push service to wake the device and
          // deliver right away instead of batching for battery savings. Reserve
          // it for genuine emergencies; marking everything urgent trains people
          // to ignore it.
          urgent ? { urgency: 'high' } : undefined
        )
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          console.error('sendPush: send failed', { userId, endpoint: sub.endpoint, err })
        }
      }
    })
  )
}
