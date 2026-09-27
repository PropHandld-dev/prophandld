'use client'

import { useEffect, useState } from 'react'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { openPendingTab, goToTab, abandonTab } from '@/lib/externalTab'
import { formatTierPrice, type LandlordTier } from '@/lib/pricingTiers'
import { useLanguage, t, tierRangeLabel } from '@/lib/i18n'

type Status = {
  unitCount: number
  computedTier: LandlordTier
  tier: LandlordTier
  hasActiveSubscription: boolean
  hasStripeCustomer: boolean
}

export function BillingSection() {
  const lang = useLanguage()
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const syncRes = await fetch('/api/stripe/subscription/sync', { method: 'POST' })
      const syncData = await syncRes.json().catch(() => ({}))
      if (!syncRes.ok) {
        console.error('BillingSection: sync failed', syncData)
        setError((syncData.error || t('couldNotSyncUnitCount', lang)) + (syncData.detail ? ` (${syncData.detail})` : ''))
      }
    } catch (err) {
      console.error('BillingSection: sync request failed', err)
    }

    try {
      const res = await fetch('/api/stripe/subscription/status')
      const data = await res.json()
      if (res.ok) {
        setStatus(data)
      } else {
        setError((data.error || t('couldNotLoadBillingStatus', lang)) + (data.detail ? ` (${data.detail})` : ''))
      }
    } catch (err) {
      console.error('BillingSection: status request failed', err)
      setError(t('couldNotLoadBillingStatus', lang))
    }
    setLoading(false)
  }

  useEffect(() => {
    load()

    // Checkout/portal open in another tab — refresh when the user returns.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const handleSubscribe = async () => {
    const tab = openPendingTab()
    setRedirecting(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/subscription/checkout', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        abandonTab(tab)
        setError(data.error || t('couldNotStartCheckout', lang))
        setRedirecting(false)
        return
      }
      goToTab(tab, data.url)
      setRedirecting(false)
    } catch {
      abandonTab(tab)
      setError(t('couldNotStartCheckout', lang))
      setRedirecting(false)
    }
  }

  const handleManageBilling = async () => {
    const tab = openPendingTab()
    setRedirecting(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/billing-portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        abandonTab(tab)
        setError(data.error || t('couldNotOpenBillingPortal', lang))
        setRedirecting(false)
        return
      }
      goToTab(tab, data.url)
      setRedirecting(false)
    } catch {
      abandonTab(tab)
      setError(t('couldNotOpenBillingPortal', lang))
      setRedirecting(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
        <div className="h-32 animate-pulse bg-white/5 rounded-xl" />
      </div>
    )
  }

  if (!status) {
    return error ? (
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 mb-6 text-red-400 text-sm">{error}</div>
    ) : null
  }

  const needsToSubscribe = status.tier !== 'free' && !status.hasActiveSubscription

  return (
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
      <h2 className="text-white font-semibold mb-2">{t('billingHeading', lang)}</h2>
      <p className="text-white/50 text-sm mb-1">
        {t('youHaveUnitsPlanIs', lang)} <span className="text-white font-semibold">{status.unitCount} unit{status.unitCount === 1 ? '' : 's'}</span>, {t('soYourPlanIs', lang)}{' '}
        <span className="text-white font-semibold">{formatTierPrice(status.unitCount)}</span>.
      </p>
      <p className="text-white/60 text-sm mb-6">{t('platformFeeDesc', lang)}</p>

      <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-5 py-4 mb-4">
        <div>
          <p className="text-white font-semibold">{formatTierPrice(status.unitCount)}</p>
          <p className="text-white/60 text-xs mt-0.5">
            {status.unitCount} unit{status.unitCount === 1 ? '' : 's'} · {tierRangeLabel(status.tier, lang)} {t('tierSuffix', lang)}
          </p>
        </div>
        {status.tier !== 'free' && (
          <span className={
            status.hasActiveSubscription
              ? 'text-xs font-semibold px-2.5 py-1 rounded-full bg-[#0A7B7E]/20 text-[#12A5A9]'
              : 'text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400'
          }>
            {status.hasActiveSubscription ? t('activeStatus', lang) : t('paymentNeededBadge', lang)}
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {needsToSubscribe ? (
        <RippleButton
          onClick={handleSubscribe}
          disabled={redirecting}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
        >
          {redirecting ? t('redirecting', lang) : `${t('subscribeColon', lang)} ${formatTierPrice(status.unitCount)}`}
        </RippleButton>
      ) : status.hasStripeCustomer ? (
        <RippleButton
          onClick={handleManageBilling}
          disabled={redirecting}
          className="bg-white/5 border border-white/10 text-white/70 text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-white/8 transition disabled:opacity-50"
        >
          {redirecting ? t('redirecting', lang) : t('manageBillingBtn', lang)}
        </RippleButton>
      ) : (
        <p className="text-white/50 text-xs">{t('oneUnitStaysFree', lang)}</p>
      )}
    </ScrollReveal>
  )
}
