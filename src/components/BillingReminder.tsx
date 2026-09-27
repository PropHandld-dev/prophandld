'use client'

import { useState } from 'react'
import Link from 'next/link'
import { RippleButton } from '@/components/RippleButton'
import { openPendingTab, goToTab, abandonTab } from '@/lib/externalTab'
import { useBillingStatus, BILLING_ENFORCED } from '@/lib/useBillingStatus'
import { formatTierPrice } from '@/lib/pricingTiers'
import { useLanguage, t } from '@/lib/i18n'

function useSubscribe() {
  const lang = useLanguage()
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subscribe = async () => {
    const tab = openPendingTab()
    setRedirecting(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/subscription/checkout', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        abandonTab(tab)
        setError(data.error || t('couldNotStartCheckout', lang))
      } else {
        goToTab(tab, data.url)
      }
    } catch {
      abandonTab(tab)
      setError(t('couldNotStartCheckout', lang))
    }
    setRedirecting(false)
  }

  return { subscribe, redirecting, error }
}

// Landlord dashboard: a calm, clear reminder while a subscription is due.
// It never blocks the everyday work (requests, rent, messages).
export function BillingReminder() {
  const lang = useLanguage()
  const { needsPayment, unitCount, daysLeftInTrial, trialExpired } = useBillingStatus()
  const { subscribe, redirecting, error } = useSubscribe()
  if (!needsPayment) return null

  return (
    <div className="bg-yellow-500/8 border border-yellow-500/25 rounded-2xl p-5 mb-6" role="status">
      <p className="text-yellow-400 text-xs font-semibold uppercase tracking-wide mb-1">{t('paymentNeededBadge', lang)}</p>
      <p className="text-white font-semibold">
        {t('planIsForUnits', lang)} {formatTierPrice(unitCount)} {t('forLabel', lang)} {unitCount} unit{unitCount === 1 ? '' : 's'}.
      </p>
      <p className="text-white/60 text-sm mt-1">
        {!trialExpired && daysLeftInTrial !== null
          ? `${t('trialEndsInPrefix', lang)} ${daysLeftInTrial} ${daysLeftInTrial === 1 ? t('dayWordSingular', lang) : t('daysWord', lang)}.`
          : trialExpired
            ? t('trialEndedMsg', lang)
            : BILLING_ENFORCED
              ? t('subscribeKeepAddingEnforced', lang)
              : t('subscribeGoodStanding', lang)}
      </p>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      <div className="flex items-center gap-4 mt-4 flex-wrap">
        <RippleButton
          onClick={subscribe}
          disabled={redirecting}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
        >
          {redirecting ? t('redirecting', lang) : `${t('subscribeColon', lang)} ${formatTierPrice(unitCount)}`}
        </RippleButton>
        <Link href="/profile" className="text-white/60 hover:text-white text-sm transition">
          {t('seeBillingDetails', lang)}
        </Link>
      </div>
    </div>
  )
}

// Shown in place of the "add" form when the subscription is due and
// enforcement is switched on.
export function SubscribeToAdd({ what }: { what: string }) {
  const lang = useLanguage()
  const { unitCount } = useBillingStatus()
  const { subscribe, redirecting, error } = useSubscribe()

  return (
    <div className="bg-white/3 border border-yellow-500/25 rounded-2xl p-6 text-center" role="status">
      <p className="text-white font-semibold text-lg">{t('subscribeToAdd', lang)} {what}</p>
      <p className="text-white/60 text-sm mt-2 max-w-sm mx-auto">
        {t('planIsForUnits', lang)} {formatTierPrice(unitCount)} {t('forLabel', lang)} {unitCount} unit{unitCount === 1 ? '' : 's'}. {t('onceActiveAddMore', lang)}
      </p>
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      <RippleButton
        onClick={subscribe}
        disabled={redirecting}
        className="mt-5 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50"
      >
        {redirecting ? t('redirecting', lang) : `${t('subscribeColon', lang)} ${formatTierPrice(unitCount)}`}
      </RippleButton>
    </div>
  )
}
