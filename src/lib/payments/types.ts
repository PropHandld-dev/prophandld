// Shared types for the payment-provider abstraction. Stripe is the only
// concrete adapter built right now; Dwolla is reserved for later (see
// index.ts) so rent's ACH payments can move providers without rewriting
// the routes/cron that call through this interface.
export type PaymentProvider = 'stripe' | 'dwolla'

export interface ChargeParams {
  amountCents: number
  paymentMethodId: string
  connectedAccountId: string
  applicationFeeCents: number
  paymentMethodTypes: string[]
  metadata: Record<string, string>
  offSession?: boolean
}

export type ChargeStatus = 'succeeded' | 'processing' | 'requires_action' | 'requires_payment_method' | 'failed'

export interface ChargeResult {
  providerChargeId: string
  clientSecret: string | null
  status: ChargeStatus
}

export interface OnboardingLinkParams {
  userId: string
  existingAccountId: string | null
  email: string | null
  fullName: string | null
  phone: string | null
  role: 'landlord' | 'contractor'
  returnPath: string
}

export interface OnboardingLinkResult {
  url: string
  accountId: string
}
