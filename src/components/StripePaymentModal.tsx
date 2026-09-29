'use client'

import { useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { getStripeClient } from '@/lib/stripeClient'
import { RippleButton } from '@/components/RippleButton'

export type PaymentOutcome = 'succeeded' | 'processing'
// What a `verify` call can come back with: 'ok' means show the normal
// success screen; 'rejected' means the charge was reversed (so far, only
// rent's "that was a credit card" case) and a plain, honest message should
// show instead of a false "Payment complete."
export type VerifyResult = { ok: true } | { ok: false; message: string }

function PaymentForm({
  amount,
  note,
  verifying,
  onConfirmed,
  onClose,
}: {
  amount: number
  note?: string
  verifying: boolean
  onConfirmed: (outcome: PaymentOutcome) => void
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
      onConfirmed(paymentIntent.status)
      return
    }

    setError('Payment could not be completed.')
    setSubmitting(false)
  }

  const busy = submitting || verifying

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
          disabled={!stripe || busy}
          className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
        >
          {verifying ? 'Confirming...' : submitting ? 'Processing...' : `Pay $${amount.toFixed(2)}`}
        </RippleButton>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
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

// Shown instead of SuccessView when `verify` comes back rejected — a charge
// that went through on Stripe's side but got reversed a moment later (today,
// only rent's "that card turned out to be a credit card" case). Deliberately
// not styled like an error: the payment attempt itself wasn't the visitor's
// mistake in any way that matters, they just need to try a different method.
function RejectedView({ message, onDone }: { message: string; onDone: () => void }) {
  return (
    <div className="text-center py-2" role="status" aria-live="polite">
      <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-yellow-600 to-yellow-400 shadow-[0_10px_40px_-8px_rgba(234,179,8,0.5)] flex items-center justify-center motion-safe:animate-[popIn_0.45s_cubic-bezier(0.34,1.56,0.64,1)_both]">
        <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <circle cx="12" cy="16" r="0.5" fill="white" />
        </svg>
      </div>
      <h3 className="text-white font-bold text-xl">That didn't go through</h3>
      <p className="text-white/60 text-sm mt-3 max-w-xs mx-auto">{message}</p>
      <RippleButton
        onClick={onDone}
        className="w-full mt-6 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90"
      >
        Got it
      </RippleButton>
    </div>
  )
}

/**
 * `onPaid` fires the moment the payment goes through (refresh data behind the
 * modal); the modal then shows a confirmation screen. `onSuccess` fires when
 * the person taps Done, and is where callers close the modal.
 *
 * `verify`, when passed, runs after Stripe confirms the charge but BEFORE
 * the success screen shows — the modal waits on it and only shows "Payment
 * complete" if it resolves `{ ok: true }`. This exists because Stripe
 * doesn't expose a card's funding type (debit vs. credit) until after a
 * charge is confirmed, so a flow that needs to reject credit cards (rent)
 * can only find out AFTER Stripe already says "succeeded." Without this,
 * the modal would show a real "Payment complete" for a split second before
 * the charge gets silently reversed behind the scenes. Callers that don't
 * have this concern (job payments, which accept any card) can leave it out
 * entirely and get the original immediate-success behavior.
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
  verify,
}: {
  clientSecret: string
  amount: number
  title: string
  note?: string
  successMessage?: string
  onClose: () => void
  onPaid?: (outcome: PaymentOutcome) => void
  onSuccess: () => void
  verify?: (outcome: PaymentOutcome) => Promise<VerifyResult>
}) {
  const [outcome, setOutcome] = useState<PaymentOutcome | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [rejected, setRejected] = useState<string | null>(null)

  const handleConfirmed = async (result: PaymentOutcome) => {
    if (!verify) {
      setOutcome(result)
      onPaid?.(result)
      return
    }
    setVerifying(true)
    try {
      const verdict = await verify(result)
      if (verdict.ok) {
        setOutcome(result)
        onPaid?.(result)
      } else {
        setRejected(verdict.message)
        onPaid?.(result)
      }
    } catch {
      // Couldn't reach the verify step at all — Stripe already says the
      // charge succeeded, so treat it as a normal success rather than
      // stranding the person on a spinner; the real status still gets
      // caught by the webhook and any later page-load sync either way.
      setOutcome(result)
      onPaid?.(result)
    }
    setVerifying(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#0F2138] border border-white/10 rounded-2xl p-6 w-full max-w-md">
        {rejected ? (
          <RejectedView message={rejected} onDone={onSuccess} />
        ) : outcome ? (
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
              <PaymentForm amount={amount} note={note} verifying={verifying} onConfirmed={handleConfirmed} onClose={onClose} />
            </Elements>
          </>
        )}
      </div>
    </div>
  )
}
