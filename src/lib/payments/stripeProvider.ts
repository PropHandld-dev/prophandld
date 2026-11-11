import { getStripe } from '@/lib/stripe'
import { toE164 } from '@/lib/phoneFormat'
import type { PaymentProviderAdapter } from './PaymentProviderAdapter'
import type { ChargeParams, ChargeResult, ChargeStatus, OnboardingLinkParams, OnboardingLinkResult } from './types'

// Wraps the exact same Stripe calls the rent routes already made directly
// — this adapter doesn't change any behavior on its own, it just moves
// those calls behind the PaymentProviderAdapter interface so the routes
// stop importing getStripe() for rent-specific logic. Direct charges only
// (created with the Stripe-Account header against the connected account
// itself, no transfer_data) — that's the whole point of the rebuild this
// belongs to: the connected account is the merchant of record, not the
// platform.
function mapStatus(stripeStatus: string): ChargeStatus {
  switch (stripeStatus) {
    case 'succeeded':
      return 'succeeded'
    case 'processing':
      return 'processing'
    case 'requires_action':
      return 'requires_action'
    case 'requires_payment_method':
      return 'requires_payment_method'
    default:
      return 'failed'
  }
}

export const stripeProvider: PaymentProviderAdapter = {
  async createDirectCharge(params: ChargeParams): Promise<ChargeResult> {
    const stripe = getStripe()
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: params.amountCents,
        currency: 'usd',
        payment_method_types: params.paymentMethodTypes,
        application_fee_amount: params.applicationFeeCents || undefined,
        metadata: params.metadata,
        // Only set when charging an already-saved method off-session
        // (tenant/landlord autopay) — a one-time payment leaves these out
        // entirely and lets the client fill in and confirm via Elements.
        ...(params.paymentMethodId ? { payment_method: params.paymentMethodId } : {}),
        ...(params.offSession ? { confirm: true, off_session: true } : {}),
      },
      { stripeAccount: params.connectedAccountId }
    )
    return {
      providerChargeId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      status: mapStatus(paymentIntent.status),
    }
  },

  async getChargeStatus(providerChargeId: string, connectedAccountId: string): Promise<ChargeStatus> {
    const stripe = getStripe()
    // Direct-charge PaymentIntents live on the connected account, not the
    // platform — retrieving one without the Stripe-Account header returns
    // "No such payment_intent", not a 404 with a useful message.
    const paymentIntent = await stripe.paymentIntents.retrieve(providerChargeId, undefined, { stripeAccount: connectedAccountId })
    return mapStatus(paymentIntent.status)
  },

  async refund(providerChargeId: string, connectedAccountId: string, amountCents?: number): Promise<void> {
    const stripe = getStripe()
    await stripe.refunds.create(
      {
        payment_intent: providerChargeId,
        ...(amountCents ? { amount: amountCents } : {}),
      },
      { stripeAccount: connectedAccountId }
    )
  },

  async getOnboardingLink(params: OnboardingLinkParams): Promise<OnboardingLinkResult> {
    const stripe = getStripe()
    let accountId = params.existingAccountId

    if (!accountId) {
      const nameParts = (params.fullName || '').trim().split(/\s+/).filter(Boolean)
      const phone = toE164(params.phone)
      const account = await stripe.accounts.create({
        business_type: 'individual',
        email: params.email || undefined,
        // Modern replacement for `type: 'standard'` — that param is
        // deprecated as of this SDK version in favor of `controller`,
        // confirmed directly against node_modules/stripe's own types
        // before writing this. requirement_collection: 'stripe' +
        // stripe_dashboard: 'full' is what "Standard" actually means now;
        // fees.payer: 'application' is the fee-absorption mechanism from
        // the plan — Stripe deducts direct-charge processing fees from
        // Prophandld's own balance instead of the connected account's,
        // natively, with nothing to reconcile.
        controller: {
          requirement_collection: 'stripe',
          stripe_dashboard: { type: 'full' },
          fees: { payer: 'application' },
          losses: { payments: 'stripe' },
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          mcc: params.role === 'landlord' ? '6513' : '1799',
          url: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com',
          product_description: params.role === 'landlord'
            ? 'Rental property owner receiving rent payments through Prophandld'
            : 'Home repair and maintenance contractor paid for jobs through Prophandld',
        },
        individual: {
          ...(nameParts.length > 0 ? { first_name: nameParts[0] } : {}),
          ...(nameParts.length > 1 ? { last_name: nameParts.slice(1).join(' ') } : {}),
          ...(params.email ? { email: params.email } : {}),
          ...(phone ? { phone } : {}),
        },
        metadata: {
          prophandld_user_id: params.userId,
          prophandld_role: params.role,
        },
      })
      accountId = account.id
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}${params.returnPath}?stripe=refresh`,
      return_url: `${origin}${params.returnPath}?stripe=return`,
      type: 'account_onboarding',
    })

    return { url: accountLink.url, accountId }
  },

  async isPayoutReady(connectedAccountId: string): Promise<boolean> {
    const stripe = getStripe()
    const account = await stripe.accounts.retrieve(connectedAccountId)
    return account.capabilities?.transfers === 'active' && account.payouts_enabled === true
  },
}
