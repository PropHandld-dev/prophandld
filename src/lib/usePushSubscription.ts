'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const bytes = Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
  // A valid VAPID/P-256 public key decodes to exactly 65 bytes starting
  // with 0x04 (uncompressed point). Checking this here, instead of
  // letting the browser's opaque "applicationServerKey is not valid"
  // error be the only signal, makes a misconfigured env var immediately
  // obvious (wrong length/prefix means the value got truncated or
  // mangled somewhere, e.g. copy-pasted with extra characters).
  if (bytes.length !== 65 || bytes[0] !== 4) {
    throw new Error(`Notification key is malformed (got ${bytes.length} bytes, expected 65). Check NEXT_PUBLIC_VAPID_PUBLIC_KEY in Vercel for a corrupted paste.`)
  }
  return bytes
}

// Everything about "does this browser have an active push subscription, and
// how do we get one" lives here — shared by EnableNotificationsCard (the
// dashboard prompt) and the Notifications settings section, so there's one
// place this logic is implemented instead of two copies quietly drifting
// apart, same bug class as this app has hit before with duplicated
// eligibility checks.
export function usePushSubscription() {
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  // True once the initial "is there already a subscription" check has
  // resolved — lets a caller avoid flashing an "enable" button for the
  // instant before that's known.
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // iOS Safari only exposes PushManager inside an installed (home-screen)
  // PWA — never in a regular browser tab, even on versions that do support
  // web push once installed. Tracked separately so callers can show
  // something actionable ("add to Home Screen first") instead of nothing.
  const [isIosBrowserTab, setIsIosBrowserTab] = useState(false)
  // The account-level "do you want push" preference (Settings), as opposed
  // to `subscribed` (does this browser have an active subscription) — two
  // different axes that used to only be checked in one place each.
  // EnableNotificationsCard used to nag to "enable notifications" even
  // after someone explicitly turned this off in Settings, and clicking
  // through it would look like a success (a real browser subscription
  // gets created) while sendPush() kept silently dropping everything
  // because this stayed false. null = not loaded yet, don't judge either way.
  const [preferenceEnabled, setPreferenceEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
    setIsIosBrowserTab(isIos && !isStandalone)

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('users')
        .select('push_notifications_enabled')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => setPreferenceEnabled(data?.push_notifications_enabled !== false))
    })

    const isSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
    setSupported(isSupported)
    if (!isSupported) {
      setChecked(true)
      return
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => setSubscribed(!!existing))
      .finally(() => setChecked(true))
  }, [])

  const enable = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
      if (!publicKey) {
        setError('Notifications are not configured yet.')
        setLoading(false)
        return false
      }

      let applicationServerKey: BufferSource
      try {
        applicationServerKey = urlBase64ToUint8Array(publicKey)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Notification setup key looks invalid.')
        setLoading(false)
        return false
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('Notifications were blocked. You can enable them in your browser settings.')
        setLoading(false)
        return false
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })

      const json = subscription.toJSON()
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(`Could not save your subscription${data.error ? `: ${data.error}` : '.'}`)
        setLoading(false)
        return false
      }

      setSubscribed(true)
      // Clicking "Enable" is itself an explicit opt-in — if the account-level
      // preference had been turned off (e.g. from Settings, before ever
      // granting browser permission), a fresh subscription should turn it
      // back on rather than silently staying off while sendPush() keeps
      // dropping everything with no visible error. /api/push/subscribe
      // does this server-side; mirrored here so the UI reflects it
      // immediately without a reload.
      setPreferenceEnabled(true)
      setLoading(false)
      return true
    } catch (err) {
      console.error('Push subscribe failed:', err)
      const message = err instanceof Error ? err.message : String(err)
      setError(`Could not enable notifications: ${message}`)
      setLoading(false)
      return false
    }
  }, [])

  return { supported, subscribed, checked, loading, error, isIosBrowserTab, enable, preferenceEnabled }
}
