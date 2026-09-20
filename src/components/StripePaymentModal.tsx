'use client'

import { useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { getStripeClient } from '@/lib/stripeClient'
import { RippleButton } from '@/components/RippleButton'

export type PaymentOutcome = 'succeeded' | 'processing'

function PaymentForm({
  amount,
  note,
  onPaid,
  onClose,
}: {
  amount: number
  note?: string
  onPaid: (outcome: PaymentOutcome) => void
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
      onPaid(paymentIntent.status)
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

function SuccessView({
  amount,
  outcome,
  message,
  onDone,
}: {
  amount: number
  outcome: PaymentOutcome
  message?: string
  onDone: () => void
}) {
  const paid = outcome === 'succeeded'

  return (
    <div className="text-center py-2" role="status" aria-live="polite">
      <div className="relative w-20 h-20 mx-auto mb-5">
        {paid && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-[#12A5A9]/30 motion-safe:animate-[ringOut_1.2s_ease-out_0.15s_both]"
          />
        )}
        <div
          className={`relative w-20 h-20 rounded-full flex items-center justify-center motion-safe:animate-[popIn_0.45s_cubic-bezier(0.34,1.56,0.64,1)_both] ${
            paid
              ? 'bg-gradient-to-br from-[#0A7B7E] to-[#12A5A9] shadow-[0_10px_40px_-8px_rgba(18,165,169,0.6)]'
              : 'bg-gradient-to-br from-yellow-600 to-yellow-400 shadow-[0_10px_40px_-8px_rgba(234,179,8,0.5)]'
          }`}
        >
          {paid ? (
            <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                style={{ strokeDasharray: 24 }}
                className="motion-safe:animate-[drawStroke_0.4s_ease-out_0.3s_both]"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          )}
        </div>
      </div>

      <h3 className="text-white font-bold text-xl">{paid ? 'Payment complete' : 'Payment on its way'}</h3>
      <p className="text-white text-3xl font-bold mt-2 tabular-nums">${amount.toFixed(2)}</p>
      <p className="text-white/60 text-sm mt-3 max-w-xs mx-auto">
        {paid
          ? (message ?? 'Your payment went through. A receipt is saved in the app.')
          : 'Your bank payment has started. Bank transfers usually take 1 to 3 business days to clear. We’ll email you when it’s done.'}
      </p>

      <RippleButton
        onClick={onDone}
        className="w-full mt-6 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90"
      >
        Done
      </RippleButton>
    </div>
  )
}

/**
 * `onPaid` fires the moment the payment goes through (refresh data behind the
 * modal); the modal then shows a confirmation screen. `onSuccess` fires when
 * the person taps Done, and is where callers close the modal.
 */
export function StripePaymentModal({
  clientSecret,
  amount,
  title,
  note,
  successMessage,
  onClose,
  onPaid,
  onSuccess,
}: {
  clientSecret: string
  amount: number
  title: string
  note?: string
  successMessage?: string
  onClose: () => void
  onPaid?: (outcome: PaymentOutcome) => void
  onSuccess: () => void
}) {
  const [outcome, setOutcome] = useState<PaymentOutcome | null>(null)

  const handlePaid = (result: PaymentOutcome) => {
    setOutcome(result)
    onPaid?.(result)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#0F2138] border border-white/10 rounded-2xl p-6 w-full max-w-md">
        {outcome ? (
          <SuccessView amount={amount} outcome={outcome} message={successMessage} onDone={onSuccess} />
        ) : (
          <>
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
              <PaymentForm amount={amount} note={note} onPaid={handlePaid} onClose={onClose} />
            </Elements>
          </>
        )}
      </div>
    </div>
  )
}
