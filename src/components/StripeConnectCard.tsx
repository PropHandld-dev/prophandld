'use client'

import { useEffect, useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { CheckCircleIcon } from '@/components/icons'

type ConnectStatus = 'not_started' | 'onboarding' | 'active'

export function StripeConnectCard({ purpose }: { purpose: 'rent' | 'jobs' }) {
  const [status, setStatus] = useState<ConnectStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/stripe/connect/status')
        const data = await res.json()
        setStatus(res.ok ? data.status : 'not_started')
      } catch {
        setStatus('not_started')
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleSetup = async () => {
    setRedirecting(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/connect/onboard', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error || 'Could not start payout setup.')
        setRedirecting(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Could not start payout setup.')
      setRedirecting(false)
    }
  }

  const copy = purpose === 'rent'
    ? {
        title: 'Get paid rent',
        body: 'Connect a bank account so rent payments made through Prophandld go straight to you.',
      }
    : {
        title: 'Get paid for jobs',
        body: 'Connect a payout method (bank account or instant debit-card payout) so landlords can pay you through Prophandld.',
      }

  return (
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white font-semibold">{copy.title}</h2>
        {!loading && status && (
          <span className={
            status === 'active'
              ? 'inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#0A7B7E]/20 text-[#12A5A9]'
              : status === 'onboarding'
                ? 'text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400'
                : 'text-xs font-semibold px-2.5 py-1 rounded-full bg-white/8 text-white/50'
          }>
            {status === 'active' && <CheckCircleIcon className="w-3 h-3" />}
            {status === 'active' ? 'Payouts active' : status === 'onboarding' ? 'Setup in progress' : 'Not set up'}
          </span>
        )}
      </div>
      <p className="text-white/50 text-sm mb-4">{copy.body}</p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-10 w-40 bg-white/5 rounded-xl animate-pulse" />
      ) : status !== 'active' ? (
        <RippleButton
          onClick={handleSetup}
          disabled={redirecting}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
        >
          {redirecting ? 'Redirecting...' : status === 'onboarding' ? 'Finish setup' : 'Set up payouts'}
        </RippleButton>
      ) : (
        <RippleButton
          onClick={handleSetup}
          className="bg-white/5 border border-white/10 text-white/70 text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-white/8 transition"
        >
          Manage payout account
        </RippleButton>
      )}
    </ScrollReveal>
  )
}
