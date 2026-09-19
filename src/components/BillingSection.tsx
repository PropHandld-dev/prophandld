'use client'

import { useEffect, useState } from 'react'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'

type Status = {
  unitCount: number
  computedTier: 'free' | 'tier_20' | 'tier_50' | 'tier_80'
  tier: 'free' | 'tier_20' | 'tier_50' | 'tier_80'
  hasActiveSubscription: boolean
  hasStripeCustomer: boolean
}

const TIER_PRICE_LABELS: Record<Status['tier'], string> = {
  free: 'Free plan',
  tier_20: '$20/month plan',
  tier_50: '$50/month plan',
  tier_80: '$80/month plan',
}

const TIER_LABELS: Record<Status['tier'], string> = {
  free: 'Free',
  tier_20: '$20/month',
  tier_50: '$50/month',
  tier_80: '$80/month',
}

const TIER_RANGE_LABELS: Record<Status['tier'], string> = {
  free: '0–2 units',
  tier_20: '3–5 units',
  tier_50: '6–10 units',
  tier_80: '11+ units',
}

export function BillingSection() {
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
        setError((syncData.error || 'Could not sync your unit count.') + (syncData.detail ? ` (${syncData.detail})` : ''))
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
        setError((data.error || 'Could not load billing status.') + (data.detail ? ` (${data.detail})` : ''))
      }
    } catch (err) {
      console.error('BillingSection: status request failed', err)
      setError('Could not load billing status.')
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleSubscribe = async () => {
    setRedirecting(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/subscription/checkout', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error || 'Could not start checkout.')
        setRedirecting(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Could not start checkout.')
      setRedirecting(false)
    }
  }

  const handleManageBilling = async () => {
    setRedirecting(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/billing-portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error || 'Could not open billing portal.')
        setRedirecting(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Could not open billing portal.')
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
      <h2 className="text-white font-semibold mb-2">Billing</h2>
      <p className="text-white/50 text-sm mb-1">
        You have <span className="text-white font-semibold">{status.unitCount} unit{status.unitCount === 1 ? '' : 's'}</span>, so your plan is the{' '}
        <span className="text-white font-semibold">{TIER_PRICE_LABELS[status.tier]}</span>.
      </p>
      <p className="text-white/60 text-sm mb-6">Your Prophandld platform fee, based on how many units you manage.</p>

      <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-5 py-4 mb-4">
        <div>
          <p className="text-white font-semibold">{TIER_LABELS[status.tier]}</p>
          <p className="text-white/60 text-xs mt-0.5">
            {status.unitCount} unit{status.unitCount === 1 ? '' : 's'} · {TIER_RANGE_LABELS[status.tier]} tier
          </p>
        </div>
        {status.tier !== 'free' && (
          <span className={
            status.hasActiveSubscription
              ? 'text-xs font-semibold px-2.5 py-1 rounded-full bg-[#0A7B7E]/20 text-[#12A5A9]'
              : 'text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400'
          }>
            {status.hasActiveSubscription ? 'Active' : 'Payment needed'}
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
          {redirecting ? 'Redirecting...' : `Subscribe: ${TIER_LABELS[status.tier]}`}
        </RippleButton>
      ) : status.hasStripeCustomer ? (
        <RippleButton
          onClick={handleManageBilling}
          disabled={redirecting}
          className="bg-white/5 border border-white/10 text-white/70 text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-white/8 transition disabled:opacity-50"
        >
          {redirecting ? 'Redirecting...' : 'Manage billing'}
        </RippleButton>
      ) : (
        <p className="text-white/50 text-xs">0–2 units stay free, no card needed.</p>
      )}
    </ScrollReveal>
  )
}
