'use client'

import { useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { getStripeClient } from '@/lib/stripeClient'
import { RippleButton } from '@/components/RippleButton'

function PaymentForm({
  amount,
  note,
  onSuccess,
  onClose,
}: {
  amount: number
  note?: string
  onSuccess: () => void
  onClose: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setSubmitting(true)
    setError(null)

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })

    if (confirmError) {
      setError(confirmError.message || 'Payment failed. Please try again.')
      setSubmitting(false)
      return
    }

    if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
      onSuccess()
      return
    }

    setError('Payment could not be completed.')
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="text-white/50 text-sm">Amount</span>
        <span className="text-white font-bold text-xl">${amount.toFixed(2)}</span>
      </div>
      {note && <p className="text-white/60 text-xs">{note}</p>}

      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <PaymentElement />
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <RippleButton
          type="submit"
          disabled={!stripe || submitting}
          className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Processing...' : `Pay $${amount.toFixed(2)}`}
        </RippleButton>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="text-white/50 hover:text-white text-sm transition disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

export function StripePaymentModal({
  clientSecret,
  amount,
  title,
  note,
  onClose,
  onSuccess,
}: {
  clientSecret: string
  amount: number
  title: string
  note?: string
  onClose: () => void
  onSuccess: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#0F2138] border border-white/10 rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-white font-semibold text-lg mb-4">{title}</h3>
        <Elements
          stripe={getStripeClient()}
          options={{
            clientSecret,
            appearance: {
              theme: 'night',
              variables: {
                colorPrimary: '#12A5A9',
                colorBackground: '#0F2138',
                colorText: '#ffffff',
                colorDanger: '#f87171',
                borderRadius: '12px',
              },
            },
          }}
        >
          <PaymentForm amount={amount} note={note} onSuccess={onSuccess} onClose={onClose} />
        </Elements>
      </div>
    </div>
  )
}
