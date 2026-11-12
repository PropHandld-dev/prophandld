'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ScrollReveal } from '@/components/ScrollReveal'
import { PlaidLinkButton } from '@/components/PlaidLinkButton'

function LinkBankContent() {
  const router = useRouter()
  const params = useSearchParams()
  const returnPath = params.get('returnPath') || '/profile'

  const [step, setStep] = useState<'start' | 'linking' | 'done'>('start')
  const [error, setError] = useState<string | null>(null)

  const handleLinked = async ({ publicToken, accountId }: { publicToken: string; accountId: string }) => {
    setStep('linking')
    setError(null)
    try {
      // Ensure a Dwolla receive-only Customer exists before attaching a
      // funding source to it -- a fresh landlord who has never set up
      // Dwolla payouts before won't have one yet.
      const customerRes = await fetch('/api/payments/dwolla/customer', { method: 'POST' })
      if (!customerRes.ok) {
        const data = await customerRes.json().catch(() => ({}))
        throw new Error(data.error || 'Could not set up your payout account')
      }

      const exchangeRes = await fetch('/api/plaid/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicToken, accountId }),
      })
      if (!exchangeRes.ok) {
        const data = await exchangeRes.json().catch(() => ({}))
        throw new Error(data.error || 'Could not link that bank account')
      }

      const fundingRes = await fetch('/api/plaid/dwolla-funding-source', { method: 'POST' })
      if (!fundingRes.ok) {
        const data = await fundingRes.json().catch(() => ({}))
        throw new Error(data.error || 'Could not finish linking that bank account')
      }

      setStep('done')
      setTimeout(() => router.replace(returnPath), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong linking your bank account.')
      setStep('start')
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0F1C] px-4 py-10 flex items-center justify-center">
      <ScrollReveal className="w-full max-w-md bg-white/3 border border-white/8 rounded-2xl p-6">
        <h1 className="text-white font-semibold text-lg mb-2">Link your bank account</h1>
        <p className="text-white/50 text-sm mb-6">
          Securely connect your bank through Plaid so rent payments can be deposited directly into your account.
          Prophandld never sees or stores your login credentials.
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
            {error}
          </div>
        )}

        {step === 'done' ? (
          <div className="bg-[#0A7B7E]/15 border border-[#0A7B7E]/30 rounded-xl px-4 py-3 text-[#12A5A9] text-sm">
            Bank linked — redirecting you back…
          </div>
        ) : (
          <PlaidLinkButton
            label={step === 'linking' ? 'Finishing up…' : 'Link bank account'}
            onLinked={handleLinked}
            onError={setError}
          />
        )}
      </ScrollReveal>
    </div>
  )
}

export default function LinkBankPage() {
  return (
    <Suspense>
      <LinkBankContent />
    </Suspense>
  )
}
