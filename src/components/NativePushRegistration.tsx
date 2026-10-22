'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// Exported so profile/page.tsx's sign-out/delete-account cleanup can read
// this device's own native token without re-querying the plugin.
export const NATIVE_PUSH_TOKEN_KEY = 'prophandld_native_push_token'

// The web-push mechanism the rest of the app uses (usePushSubscription.ts,
// service worker) doesn't work at all inside the iOS/Android wrapper apps
// — there's no Web Push API in a Capacitor WebView. This is the native
// equivalent: registers this device for a real FCM (Android) / APNs (iOS)
// token and saves it so sendPush() (src/lib/push.ts) can deliver to it. A
// no-op on the website itself — Capacitor.isNativePlatform() is only ever
// true inside the actual wrapped app, never in a browser tab.
//
// Mounted alongside InactivityGuard in each role layout, same reasoning:
// needs to run once, globally, for any signed-in user, regardless of
// which page they land on first.
export function NativePushRegistration() {
  useEffect(() => {
    let cancelled = false
    let removeListeners: (() => void) | null = null

    const init = async () => {
      // Dynamic import: @capacitor/push-notifications pulls in native
      // bridge code that has nothing useful to do in a plain browser tab
      // (the far more common case by far) — no reason to ship it into
      // every visit's JS bundle.
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) return

      const { PushNotifications } = await import('@capacitor/push-notifications')
      const platform = Capacitor.getPlatform() as 'ios' | 'android'

      const { receive } = await PushNotifications.checkPermissions()
      let granted = receive === 'granted'
      if (receive === 'prompt' || receive === 'prompt-with-rationale') {
        const result = await PushNotifications.requestPermissions()
        granted = result.receive === 'granted'
      }
      if (!granted || cancelled) return

      const onRegistration = PushNotifications.addListener('registration', (token) => {
        // Cached per-device so sign-out (profile/page.tsx) can delete this
        // exact row without needing to re-query the native plugin — the
        // same reasoning the web-push cleanup already uses, mirrored for
        // native. See NATIVE_PUSH_TOKEN_KEY.
        try {
          localStorage.setItem(NATIVE_PUSH_TOKEN_KEY, token.value)
        } catch {}
        fetch('/api/push/register-native', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token.value, platform }),
        }).catch((err) => console.error('NativePushRegistration: could not save token', err))
      })

      const onError = PushNotifications.addListener('registrationError', (err) => {
        console.error('NativePushRegistration: registration failed', err)
      })

      // Foreground delivery and a tapped notification both need to at
      // least navigate somewhere — mirrors what the web push service
      // worker's notificationclick handler already does for the web.
      const onReceived = PushNotifications.addListener('pushNotificationReceived', (notification) => {
        // iOS/Android both already show the system notification banner
        // on their own while the app is foregrounded for a data-only or
        // alert push; nothing extra to render here today.
        void notification
      })
      const onActionPerformed = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const url = (action.notification.data as Record<string, string> | undefined)?.url
        if (url) window.location.href = url
      })

      await PushNotifications.register()

      removeListeners = () => {
        onRegistration.then((h) => h.remove())
        onError.then((h) => h.remove())
        onReceived.then((h) => h.remove())
        onActionPerformed.then((h) => h.remove())
      }
    }

    // Only bother once someone's actually signed in — a native token
    // saved with no user to attach it to is useless.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && !cancelled) init()
    })

    return () => {
      cancelled = true
      removeListeners?.()
    }
  }, [])

  return null
}
