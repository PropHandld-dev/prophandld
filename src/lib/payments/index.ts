import type { PaymentProvider } from './types'
import type { PaymentProviderAdapter } from './PaymentProviderAdapter'
import { stripeProvider } from './stripeProvider'
import { dwollaProvider } from './dwollaProvider'

export type { PaymentProvider, ChargeParams, ChargeResult, ChargeStatus, OnboardingLinkParams, OnboardingLinkResult } from './types'
export type { PaymentProviderAdapter } from './PaymentProviderAdapter'

// The only place that knows which concrete adapter backs a given
// provider id. dwollaProvider.createDirectCharge() still throws -- it
// needs the renter's own funding source resolved first, which the shared
// ChargeParams shape doesn't carry (see dwollaProvider.ts) -- so flipping
// users.ach_provider to 'dwolla' today would get a landlord through
// onboarding but fail at the first rent charge. Everything else on the
// adapter (customer/funding-source creation, status, payout readiness) is
// real and sandbox-tested.
export function getProviderAdapter(provider: PaymentProvider): PaymentProviderAdapter {
  if (provider === 'stripe') return stripeProvider
  if (provider === 'dwolla') return dwollaProvider
  throw new Error(`Payment provider "${provider}" has no adapter yet`)
}
