import { LockIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'

// A small, factual reassurance line for the actual moment of paying or
// setting up a payout. Every claim here is true of the real
// implementation: Prophandld's own servers never receive a full card or
// bank account number, only Stripe does (see StripePaymentModal). No
// "bank-level encryption" or other unverifiable marketing language —
// just what's actually true.
export function PaymentTrustBadge({ provider }: { provider: 'stripe' }) {
  const lang = useLanguage()
  void provider // kept as a prop at every call site for now; only one value exists today
  return (
    <p className="flex items-center gap-1.5 text-white/40 text-xs justify-center text-center">
      <LockIcon className="w-3 h-3 shrink-0" />
      {t('paymentTrustStripe', lang)}
    </p>
  )
}
