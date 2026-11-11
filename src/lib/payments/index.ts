import type { PaymentProvider } from './types'
import type { PaymentProviderAdapter } from './PaymentProviderAdapter'
import { stripeProvider } from './stripeProvider'

export type { PaymentProvider, ChargeParams, ChargeResult, ChargeStatus, OnboardingLinkParams, OnboardingLinkResult } from './types'
export type { PaymentProviderAdapter } from './PaymentProviderAdapter'

// The only place that knows which concrete adapter backs a given
// provider id. Dwolla is a real value in the PaymentProvider type (so a
// `users.ach_provider` column can already store it) but has no adapter
// yet — by design, per the brief this abstraction was built for: don't
// build the Dwolla adapter until there's an actual Dwolla account to
// integrate against.
export function getProviderAdapter(provider: PaymentProvider): PaymentProviderAdapter {
  if (provider === 'stripe') return stripeProvider
  throw new Error(`Payment provider "${provider}" has no adapter yet`)
}
