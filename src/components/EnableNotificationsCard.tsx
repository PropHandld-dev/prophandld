'use client'

import { useEffect, useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { BellIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'
import { usePushSubscription } from '@/lib/usePushSubscription'

export function EnableNotificationsCard() {
  const lang = useLanguage()
  const { supported, subscribed, loading, error, isIosBrowserTab, enable } = usePushSubscription()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // localStorage, not sessionStorage: a dismissal needs to survive past
    // this one tab/session or "Not now" only ever suppresses the card
    // until the tab closes — which reads, from the user's side, as the
    // notifications prompt coming back on every single login.
    try {
      setDismissed(localStorage.getItem('push-prompt-dismissed') === '1')
    } catch {}
  }, [])

  const handleDismiss = () => {
    try {
      localStorage.setItem('push-prompt-dismissed', '1')
    } catch {}
    setDismissed(true)
  }

  if ((!supported && !isIosBrowserTab) || subscribed || dismissed) return null

  if (isIosBrowserTab && !supported) {
    return (
      <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6 flex items-center gap-4">
        <div className="w-9 h-9 rounded-full bg-gradient-to-r from-[#0A7B7E]/30 to-[#12A5A9]/30 border border-[#12A5A9]/30 flex items-center justify-center shrink-0">
          <BellIcon className="w-4 h-4 text-[#12A5A9]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium">{t('turnOnNotifications', lang)}</p>
          <p className="text-white/60 text-xs mt-0.5">
            {t('iosNotificationsDesc', lang)}
          </p>
        </div>
        <button onClick={handleDismiss} className="text-white/50 hover:text-white/60 text-xs transition shrink-0">
          {t('notNow', lang)}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6 flex items-center gap-4">
      <div className="w-9 h-9 rounded-full bg-gradient-to-r from-[#0A7B7E]/30 to-[#12A5A9]/30 border border-[#12A5A9]/30 flex items-center justify-center shrink-0">
        <BellIcon className="w-4 h-4 text-[#12A5A9]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">{t('turnOnNotifications', lang)}</p>
        <p className="text-white/60 text-xs mt-0.5">{t('turnOnNotificationsDesc', lang)}</p>
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>
      <RippleButton
        onClick={enable}
        disabled={loading}
        className="text-xs font-semibold bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white px-3.5 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50 shrink-0"
      >
        {loading ? t('enabling', lang) : t('enable', lang)}
      </RippleButton>
      <button onClick={handleDismiss} className="text-white/50 hover:text-white/60 text-xs transition shrink-0">
        {t('notNow', lang)}
      </button>
    </div>
  )
}
