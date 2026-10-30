'use client'

import { useEffect, useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { goToStripe } from '@/lib/externalTab'
import { PaymentTrustBadge } from '@/components/PaymentTrustBadge'
import { useLanguage, t } from '@/lib/i18n'
import { AI_ASSIST_ENABLED, type AiAssistStatus } from '@/lib/aiAssist'

// Mirrors StripeConnectCard's exact shape (ScrollReveal shell, loading
// skeleton, status badge, RippleButton CTA) — not shown at all while the
// status fetch says `enabled: false`, which is what NEXT_PUBLIC_AI_ASSIST_ENABLED
// off does server-side, so this card is fully invisible until the team
// turns it on post-PDF sign-off.
export function AiAssistCard() {
  const lang = useLanguage()
  const [status, setStatus] = useState<AiAssistStatus | null>(null)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)
  const [monthlyPrice, setMonthlyPrice] = useState<number | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    // The route itself already checks this and returns instantly, but
    // skipping the fetch entirely here means zero network activity and
    // zero function invocations on every page that mounts this card while
    // the flag is off, not just a cheap no-op response.
    if (!AI_ASSIST_ENABLED) {
      setEnabled(false)
      setLoading(false)
      return
    }
    try {
      const res = await fetch('/api/ai-assist/status')
      const data = await res.json()
      setEnabled(!!data.enabled)
      setStatus(res.ok ? data.status : 'none')
      setDaysLeft(data.daysLeftInTrial ?? null)
      setMonthlyPrice(typeof data.monthlyPrice === 'number' ? data.monthlyPrice : null)
    } catch {
      setEnabled(false)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleStart = async () => {
    setWorking(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-assist/start-trial', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('aiAssistCouldNotStart', lang))
        setWorking(false)
        return
      }
      if (data.redirect && data.url) {
        goToStripe(data.url)
        return
      }
      await load()
      setWorking(false)
    } catch {
      setError(t('aiAssistCouldNotStart', lang))
      setWorking(false)
    }
  }

  const handleCancel = async () => {
    setWorking(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-assist/cancel', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('aiAssistCouldNotCancel', lang))
        setWorking(false)
        return
      }
      await load()
      setWorking(false)
    } catch {
      setError(t('aiAssistCouldNotCancel', lang))
      setWorking(false)
    }
  }

  if (loading) {
    return (
      <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6">
        <div className="h-5 w-32 bg-white/5 rounded animate-pulse mb-3" />
        <div className="h-10 w-40 bg-white/5 rounded-xl animate-pulse" />
      </ScrollReveal>
    )
  }

  if (!enabled) return null

  const isOn = status === 'trialing' || status === 'active' || status === 'past_due'

  const badge = status === 'trialing'
    ? { label: t('aiAssistStatusTrialing', lang), cls: 'bg-[#0A7B7E]/20 text-[#12A5A9]' }
    : status === 'active'
      ? { label: t('aiAssistStatusActive', lang), cls: 'bg-[#0A7B7E]/20 text-[#12A5A9]' }
      : status === 'past_due'
        ? { label: t('aiAssistStatusPastDue', lang), cls: 'bg-red-500/15 text-red-400' }
        : { label: t('aiAssistStatusNotStarted', lang), cls: 'bg-white/8 text-white/50' }

  return (
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white font-semibold">{t('aiAssistCardTitle', lang)}</h2>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
      </div>
      <p className="text-white/50 text-sm mb-4">{t('aiAssistCardBody', lang)}</p>

      {status === 'trialing' && daysLeft !== null && (
        <p className="text-[#12A5A9] text-xs font-semibold mb-4">
          {t('aiAssistDaysLeft', lang).replace('{days}', String(daysLeft))}
        </p>
      )}

      {monthlyPrice !== null && !isOn && (
        <p className="text-white/40 text-xs mb-4">${monthlyPrice % 1 === 0 ? monthlyPrice.toFixed(0) : monthlyPrice.toFixed(2)}/month after your trial, cancel anytime before then</p>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {isOn ? (
        <RippleButton
          onClick={handleCancel}
          disabled={working}
          className="bg-white/5 border border-white/10 text-white/70 text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-white/8 transition disabled:opacity-50"
        >
          {working ? t('redirecting', lang) : t('aiAssistManageBtn', lang)}
        </RippleButton>
      ) : (
        <>
          <RippleButton
            onClick={handleStart}
            disabled={working}
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
          >
            {working ? t('redirecting', lang) : t('aiAssistStartTrialBtn', lang)}
          </RippleButton>
          <div className="mt-3">
            <PaymentTrustBadge provider="stripe" />
          </div>
        </>
      )}
    </ScrollReveal>
  )
}
