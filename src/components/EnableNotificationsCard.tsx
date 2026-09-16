'use client'

import { useEffect, useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { BellIcon } from '@/components/icons'

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
    throw new Error(`Notification key is malformed (got ${bytes.length} bytes, expected 65) — check NEXT_PUBLIC_VAPID_PUBLIC_KEY in Vercel for a corrupted paste.`)
  }
  return bytes
}

export function EnableNotificationsCard() {
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const isSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
    setSupported(isSupported)
    if (!isSupported) return

    const check = async () => {
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      setSubscribed(!!existing)
    }
    check()

    setDismissed(sessionStorage.getItem('push-prompt-dismissed') === '1')
  }, [])

  const handleEnable = async () => {
    setLoading(true)
    setError(null)

    // iOS Safari only supports web push inside an installed (home-screen)
    // PWA, not a regular browser tab — catch this up front with a clear
    // message instead of letting subscribe() throw an opaque error.
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
    if (isIos && !isStandalone) {
      setError('On iPhone/iPad: tap Share → "Add to Home Screen" first, then open the app from there to enable notifications.')
      setLoading(false)
      return
    }

    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
      if (!publicKey) {
        setError('Notifications are not configured yet.')
        setLoading(false)
        return
      }

      let applicationServerKey: BufferSource
      try {
        applicationServerKey = urlBase64ToUint8Array(publicKey)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Notification setup key looks invalid.')
        setLoading(false)
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('Notifications were blocked. You can enable them in your browser settings.')
        setLoading(false)
        return
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
        return
      }

      setSubscribed(true)
    } catch (err) {
      console.error('Push subscribe failed:', err)
      const message = err instanceof Error ? err.message : String(err)
      setError(`Could not enable notifications: ${message}`)
    }
    setLoading(false)
  }

  const handleDismiss = () => {
    sessionStorage.setItem('push-prompt-dismissed', '1')
    setDismissed(true)
  }

  if (!supported || subscribed || dismissed) return null

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6 flex items-center gap-4">
      <div className="w-9 h-9 rounded-full bg-gradient-to-r from-[#0A7B7E]/30 to-[#12A5A9]/30 border border-[#12A5A9]/30 flex items-center justify-center shrink-0">
        <BellIcon className="w-4 h-4 text-[#12A5A9]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">Turn on notifications</p>
        <p className="text-white/40 text-xs mt-0.5">Get alerted the moment something needs your attention.</p>
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>
      <RippleButton
        onClick={handleEnable}
        disabled={loading}
        className="text-xs font-semibold bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white px-3.5 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50 shrink-0"
      >
        {loading ? 'Enabling...' : 'Enable'}
      </RippleButton>
      <button onClick={handleDismiss} className="text-white/30 hover:text-white/60 text-xs transition shrink-0">
        Not now
      </button>
    </div>
  )
}
