import { LockIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'

// A small, factual reassurance line for the actual moment of paying or
// setting up a payout — distinct from BankTrustNotice (a fuller box shown
// once, before someone hands over routing/account numbers or an SSN). Every
// claim here is true of the real implementation: Prophandld's own servers
// never receive a full card or bank account number, only Stripe/Dwolla do
// (see StripePaymentModal, dwolla.ts). No "bank-level encryption" or other
// unverifiable marketing language — just what's actually true.
export function PaymentTrustBadge({ provider }: { provider: 'stripe' | 'dwolla' | 'both' }) {
  const lang = useLanguage()
  const key = provider === 'stripe' ? 'paymentTrustStripe' : provider === 'dwolla' ? 'paymentTrustDwolla' : 'paymentTrustBoth'
  return (
    <p className="flex items-center gap-1.5 text-white/40 text-xs justify-center text-center">
      <LockIcon className="w-3 h-3 shrink-0" />
      {t(key, lang)}
    </p>
  )
}
