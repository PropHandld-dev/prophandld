'use client'

import { useState } from 'react'
import Link from 'next/link'
import { RippleButton } from '@/components/RippleButton'
import { openPendingTab, goToTab, abandonTab } from '@/lib/externalTab'
import { useBillingStatus, TIER_PRICE, BILLING_ENFORCED } from '@/lib/useBillingStatus'

function useSubscribe() {
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
        setError(data.error || 'Could not start checkout.')
      } else {
        goToTab(tab, data.url)
      }
    } catch {
      abandonTab(tab)
      setError('Could not start checkout.')
    }
    setRedirecting(false)
  }

  return { subscribe, redirecting, error }
}

// Landlord dashboard: a calm, clear reminder while a subscription is due.
// It never blocks the everyday work (requests, rent, messages).
export function BillingReminder() {
  const { needsPayment, tier, unitCount } = useBillingStatus()
  const { subscribe, redirecting, error } = useSubscribe()
  if (!needsPayment) return null

  return (
    <div className="bg-yellow-500/8 border border-yellow-500/25 rounded-2xl p-5 mb-6" role="status">
      <p className="text-yellow-400 text-xs font-semibold uppercase tracking-wide mb-1">Payment needed</p>
      <p className="text-white font-semibold">
        Your plan is {TIER_PRICE[tier]} for {unitCount} unit{unitCount === 1 ? '' : 's'}.
      </p>
      <p className="text-white/60 text-sm mt-1">
        {BILLING_ENFORCED
          ? 'Subscribe to keep adding properties and units. Repairs, rent and messages keep working as usual.'
          : 'Subscribe to keep your account in good standing. Repairs, rent and messages keep working as usual.'}
      </p>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      <div className="flex items-center gap-4 mt-4 flex-wrap">
        <RippleButton
          onClick={subscribe}
          disabled={redirecting}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
        >
          {redirecting ? 'Redirecting...' : `Subscribe: ${TIER_PRICE[tier]}`}
        </RippleButton>
        <Link href="/profile" className="text-white/60 hover:text-white text-sm transition">
          See billing details
        </Link>
      </div>
    </div>
  )
}

// Shown in place of the "add" form when the subscription is due and
// enforcement is switched on.
export function SubscribeToAdd({ what }: { what: string }) {
  const { tier, unitCount } = useBillingStatus()
  const { subscribe, redirecting, error } = useSubscribe()

  return (
    <div className="bg-white/3 border border-yellow-500/25 rounded-2xl p-6 text-center" role="status">
      <p className="text-white font-semibold text-lg">Subscribe to add {what}</p>
      <p className="text-white/60 text-sm mt-2 max-w-sm mx-auto">
        Your plan is {TIER_PRICE[tier]} for {unitCount} unit{unitCount === 1 ? '' : 's'}. Once it is active you can add more. Everything you already have keeps working.
      </p>
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      <RippleButton
        onClick={subscribe}
        disabled={redirecting}
        className="mt-5 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50"
      >
        {redirecting ? 'Redirecting...' : `Subscribe: ${TIER_PRICE[tier]}`}
      </RippleButton>
    </div>
  )
}
