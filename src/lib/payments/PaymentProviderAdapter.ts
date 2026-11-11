import type { ChargeParams, ChargeResult, ChargeStatus, OnboardingLinkParams, OnboardingLinkResult } from './types'

// The contract every payment provider implements. Only src/lib/payments/
// stripeProvider.ts exists today — this interface is what lets rent's ACH
// payments move to Dwolla later (per the user's own brief) without
// rewriting the routes/cron that call through it, not a speculative
// framework built ahead of an actual second provider.
export interface PaymentProviderAdapter {
  createDirectCharge(params: ChargeParams): Promise<ChargeResult>
  getChargeStatus(providerChargeId: string, connectedAccountId: string): Promise<ChargeStatus>
  refund(providerChargeId: string, connectedAccountId: string, amountCents?: number): Promise<void>
  getOnboardingLink(params: OnboardingLinkParams): Promise<OnboardingLinkResult>
  isPayoutReady(connectedAccountId: string): Promise<boolean>
}
