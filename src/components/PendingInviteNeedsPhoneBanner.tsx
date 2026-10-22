'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLanguage, t } from '@/lib/i18n'

// Set via a one-time ?pendingInviteNeedsPhone=1 query param (see
// signup/page.tsx and login/page.tsx) when a pending tenancy or co-owner
// invite matches this account's phone number but couldn't auto-link
// because that phone isn't verified — see the unverified-phone security
// fix in api/tenancy/link-invite and api/co-owner/link-invite. Without
// this, that fix is invisible from the renter/landlord's side: the invite
// just silently never links, with no sign anything was ever found. Same
// "read window.location directly, no Suspense boundary needed" pattern as
// ProfileSwitchedBanner. Persists (no auto-dismiss timer) since this one
// needs an actual action, not just an acknowledgement.
export function PendingInviteNeedsPhoneBanner() {
  const lang = useLanguage()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('pendingInviteNeedsPhone') !== '1') return

    setVisible(true)
    params.delete('pendingInviteNeedsPhone')
    const rest = params.toString()
    window.history.replaceState({}, '', rest ? `${window.location.pathname}?${rest}` : window.location.pathname)
  }, [])

  if (!visible) return null

  return (
    <div className="flex items-start gap-3 bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-4 py-3 mb-6 motion-safe:animate-[fadeIn_0.2s_ease-out]">
      <div className="flex-1 min-w-0">
        <p className="text-yellow-400/90 text-sm font-medium">{t('pendingInviteNeedsPhoneTitle', lang)}</p>
        <p className="text-yellow-400/70 text-xs mt-1">{t('pendingInviteNeedsPhoneBody', lang)}</p>
        <Link href="/profile" className="text-yellow-400 text-xs font-semibold hover:underline mt-1.5 inline-block">
          {t('pendingInviteNeedsPhoneCta', lang)}
        </Link>
      </div>
      <button
        onClick={() => setVisible(false)}
        className="text-yellow-400/50 hover:text-yellow-400 text-sm shrink-0"
        aria-label={t('cancel', lang)}
      >
        ×
      </button>
    </div>
  )
}
