'use client'

import { useEffect, useState } from 'react'

export type BillingTier = 'free' | 'tier_20' | 'tier_50' | 'tier_80'

export const TIER_PRICE: Record<BillingTier, string> = {
  free: 'Free',
  tier_20: '$20/month',
  tier_50: '$50/month',
  tier_80: '$80/month',
}

// Turning this on (NEXT_PUBLIC_BILLING_ENFORCE=on in Vercel) makes "add a
// property" and "add a unit" wait for the subscription. It is off by default,
// so nothing is blocked while the app is being tested. The reminder itself
// always shows.
export const BILLING_ENFORCED = process.env.NEXT_PUBLIC_BILLING_ENFORCE === 'on'

type State = { loading: boolean; needsPayment: boolean; tier: BillingTier; unitCount: number }

// Does this landlord owe a subscription they haven't started? A plan above
// Free (3 or more units) needs an active subscription.
export function useBillingStatus(): State {
  const [state, setState] = useState<State>({ loading: true, needsPayment: false, tier: 'free', unitCount: 0 })

  useEffect(() => {
    let cancelled = false
    fetch('/api/stripe/subscription/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        if (!data) return setState((s) => ({ ...s, loading: false }))
        const tier: BillingTier = data.computedTier ?? data.tier ?? 'free'
        setState({ loading: false, needsPayment: tier !== 'free' && !data.hasActiveSubscription, tier, unitCount: data.unitCount ?? 0 })
      })
      .catch(() => !cancelled && setState((s) => ({ ...s, loading: false })))
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
