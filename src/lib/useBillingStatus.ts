'use client'

import { useEffect, useState } from 'react'
import { type LandlordTier } from '@/lib/pricingTiers'

export type BillingTier = LandlordTier

// Turning this on (NEXT_PUBLIC_BILLING_ENFORCE=on in Vercel) makes "add a
// property" and "add a unit" wait for the subscription. It is off by default,
// so nothing is blocked while the app is being tested. The reminder itself
// always shows.
export const BILLING_ENFORCED = process.env.NEXT_PUBLIC_BILLING_ENFORCE === 'on'

type State = {
  loading: boolean
  needsPayment: boolean
  tier: BillingTier
  unitCount: number
  // null while still on the Free tier (1 unit) — the trial only starts
  // counting from the moment a subscription is actually owed. See
  // TRIAL_DAYS in pricingTiers.ts and the claim-once stamp in
  // subscription/status.
  daysLeftInTrial: number | null
  trialExpired: boolean
}

// Does this landlord owe a subscription they haven't started? A plan above
// Free (2 or more units) needs an active subscription.
export function useBillingStatus(): State {
  const [state, setState] = useState<State>({
    loading: true,
    needsPayment: false,
    tier: 'free',
    unitCount: 0,
    daysLeftInTrial: null,
    trialExpired: false,
  })

  useEffect(() => {
    let cancelled = false
    fetch('/api/stripe/subscription/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        if (!data) return setState((s) => ({ ...s, loading: false }))
        const tier: BillingTier = data.computedTier ?? data.tier ?? 'free'
        setState({
          loading: false,
          needsPayment: tier !== 'free' && !data.hasActiveSubscription,
          tier,
          unitCount: data.unitCount ?? 0,
          daysLeftInTrial: data.daysLeftInTrial ?? null,
          trialExpired: !!data.trialExpired,
        })
      })
      .catch(() => !cancelled && setState((s) => ({ ...s, loading: false })))
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
