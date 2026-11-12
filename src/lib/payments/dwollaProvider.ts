import { getDwollaClient, dwollaIdFromUrl, dwollaApiUrl } from '@/lib/dwolla'
import type { PaymentProviderAdapter } from './PaymentProviderAdapter'
import type { ChargeParams, ChargeResult, ChargeStatus, OnboardingLinkParams, OnboardingLinkResult } from './types'

// Dwolla's charge model is nothing like Stripe's: a Transfer executes
// immediately, server-side, and both the source AND destination funding
// source must already exist -- there's no client-confirms-with-their-own-
// details step the way a Stripe PaymentIntent/clientSecret has. That means
// createDirectCharge here can't actually run yet: the renter's funding
// source isn't resolvable from ChargeParams alone (it only carries a
// connectedAccountId, modeled on Stripe's single-sided destination). Real
// wiring needs the renter's own dwolla_funding_source_id looked up by the
// caller first -- deferred until Plaid-based funding-source linking
// exists, since there's no way to test a transfer without a linked
// renter funding source anyway. Everything else below (customer/funding-
// source creation, status, webhook) is real and sandbox-tested.

const STATUS_MAP: Record<string, ChargeStatus> = {
  pending: 'processing',
  processed: 'succeeded',
  failed: 'failed',
  cancelled: 'failed',
}

export async function createDwollaCustomer(params: {
  firstName: string
  lastName: string
  email: string
  type: 'receive-only' | 'unverified'
}): Promise<string> {
  const client = getDwollaClient()
  const res = await client.post('customers', {
    firstName: params.firstName,
    lastName: params.lastName,
    email: params.email,
    type: params.type,
  })
  const location = res.headers.get('location')
  if (!location) throw new Error('Dwolla customer creation did not return a location header')
  return dwollaIdFromUrl(location)
}

// Dwolla's exchange-partner id for Plaid is account-specific (confirmed:
// sandbox and production return different ids for the same "Plaid" entry)
// -- looked up by name each time rather than hardcoded. Cheap to re-fetch;
// not worth a module-level cache for how rarely this runs.
async function getPlaidExchangePartnerHref(): Promise<string> {
  const client = getDwollaClient()
  const res = await client.get('exchange-partners')
  const partner = (res.body._embedded?.['exchange-partners'] || []).find((p: any) => p.name === 'Plaid')
  if (!partner) throw new Error('Dwolla account has no "Plaid" exchange partner enabled')
  return partner._links.self.href
}

// The Plaid half hands us a Plaid processor token for this bank account.
// Dwolla turns that into an "exchange" resource, then a funding source is
// created from that exchange -- Dwolla fetches the account/routing numbers
// straight from Plaid, so the resulting funding source comes back already
// verified, no micro-deposit wait.
export async function createDwollaFundingSourceFromPlaidToken(params: {
  dwollaCustomerId: string
  plaidProcessorToken: string
  bankAccountType: 'checking' | 'savings'
  name: string
}): Promise<string> {
  const client = getDwollaClient()
  const exchangePartnerHref = await getPlaidExchangePartnerHref()
  const exchangeRes = await client.post(`customers/${params.dwollaCustomerId}/exchanges`, {
    _links: {
      'exchange-partner': { href: exchangePartnerHref },
    },
    token: params.plaidProcessorToken,
  })
  const exchangeLocation = exchangeRes.headers.get('location')
  if (!exchangeLocation) throw new Error('Dwolla exchange creation did not return a location header')

  const fundingSourceRes = await client.post(`customers/${params.dwollaCustomerId}/funding-sources`, {
    _links: { exchange: { href: exchangeLocation } },
    bankAccountType: params.bankAccountType,
    name: params.name,
  })
  const fundingSourceLocation = fundingSourceRes.headers.get('location')
  if (!fundingSourceLocation) throw new Error('Dwolla funding source creation did not return a location header')
  return dwollaIdFromUrl(fundingSourceLocation)
}

export async function getDwollaFundingSourceStatus(fundingSourceId: string): Promise<'pending' | 'verified' | 'removed'> {
  const client = getDwollaClient()
  const res = await client.get(`funding-sources/${fundingSourceId}`)
  if (res.body.removed) return 'removed'
  return res.body.status === 'verified' ? 'verified' : 'pending'
}

export async function createDwollaTransfer(params: {
  sourceFundingSourceId: string
  destinationFundingSourceId: string
  amountCents: number
}): Promise<{ transferId: string; status: ChargeStatus }> {
  const client = getDwollaClient()
  const base = dwollaApiUrl()
  const res = await client.post('transfers', {
    _links: {
      source: { href: `${base}/funding-sources/${params.sourceFundingSourceId}` },
      destination: { href: `${base}/funding-sources/${params.destinationFundingSourceId}` },
    },
    amount: { currency: 'USD', value: (params.amountCents / 100).toFixed(2) },
  })
  const location = res.headers.get('location')
  if (!location) throw new Error('Dwolla transfer creation did not return a location header')
  const transferId = dwollaIdFromUrl(location)
  // A freshly created transfer is always 'pending' -- Dwolla settles ACH
  // over 1-4 business days, same real-world delay as Stripe's ACH.
  return { transferId, status: 'processing' }
}

export async function getDwollaTransferStatus(transferId: string): Promise<ChargeStatus> {
  const client = getDwollaClient()
  const res = await client.get(`transfers/${transferId}`)
  return STATUS_MAP[res.body.status as string] || 'processing'
}

// Dwolla-specific counterpart to rentPaymentSync.ts's syncRentPayment --
// not merged with it, since that function is built entirely around
// Stripe's PaymentIntent shape (refunds, card-vs-bank metadata, surcharge
// accounting that only applies to the Stripe charge path). Dwolla
// transfers have no equivalent concepts: no card option, no surcharge, no
// separate "processing" state to poll for, and Dwolla has already pulled
// the real amount by the time a transfer completes, so there is nothing
// left to reconcile beyond status and amount. Called from the webhook
// once createDirectCharge's Dwolla path is actually wired (see the
// interface-gap note above this file's imports).
export async function syncDwollaRentPayment(
  admin: import('@supabase/supabase-js').SupabaseClient,
  rentPaymentId: string,
  transferId: string
): Promise<void> {
  const client = getDwollaClient()
  const res = await client.get(`transfers/${transferId}`)
  const dwollaStatus = res.body.status as 'pending' | 'processed' | 'failed' | 'cancelled'

  if (dwollaStatus === 'processed') {
    const { data: rent } = await admin.from('rent_payments').select('actual_amount').eq('id', rentPaymentId).maybeSingle()
    const amount = Number(res.body.amount?.value || 0)
    // .neq() guard makes this idempotent against a redelivered webhook --
    // same discipline as syncRentPayment's own update, so a retry never
    // double-credits the month.
    await admin
      .from('rent_payments')
      .update({
        dwolla_status: dwollaStatus,
        actual_amount: Number(rent?.actual_amount || 0) + amount,
        payment_method: 'bank',
        stripe_status: 'succeeded',
      })
      .eq('id', rentPaymentId)
      .neq('dwolla_status', 'processed')
  } else {
    await admin.from('rent_payments').update({ dwolla_status: dwollaStatus }).eq('id', rentPaymentId)
  }
}

export const dwollaProvider: PaymentProviderAdapter = {
  async createDirectCharge(_params: ChargeParams): Promise<ChargeResult> {
    throw new Error(
      'Dwolla direct charges need the renter’s own funding source resolved before calling this -- not wired into the shared interface yet. See dwollaProvider.ts.'
    )
  },

  async getChargeStatus(providerChargeId: string): Promise<ChargeStatus> {
    return getDwollaTransferStatus(providerChargeId)
  },

  async refund(providerChargeId: string): Promise<void> {
    // Dwolla has no refund endpoint -- reversing an ACH transfer means
    // creating a new transfer in the opposite direction between the same
    // two funding sources. Deferred until a real reversal case comes up;
    // throwing rather than silently no-op-ing so a caller can't believe
    // this succeeded.
    throw new Error(`Dwolla has no refund API -- transfer ${providerChargeId} needs a manual reverse transfer`)
  },

  async getOnboardingLink(params: OnboardingLinkParams): Promise<OnboardingLinkResult> {
    // No Dwolla-hosted onboarding page exists (unlike Stripe's Account
    // Links) -- a receive-only Customer needs no verification at all, so
    // "onboarding" is just creating the Customer record, then sending the
    // landlord to our own in-app bank-linking page (Plaid Link, then the
    // Dwolla exchange above) to attach a payout funding source.
    const [firstName, ...rest] = (params.fullName || 'Landlord').split(' ')
    const dwollaCustomerId =
      params.existingAccountId ||
      (await createDwollaCustomer({
        firstName,
        lastName: rest.join(' ') || 'User',
        email: params.email || `${params.userId}@prophandld.com`,
        type: 'receive-only',
      }))
    return {
      url: `/landlord/payouts/link-bank?returnPath=${encodeURIComponent(params.returnPath)}`,
      accountId: dwollaCustomerId,
    }
  },

  async isPayoutReady(connectedAccountId: string): Promise<boolean> {
    // A receive-only Customer is never "verified" in Dwolla's own sense --
    // that status only applies to Customers that send money. What
    // actually gates payouts is whether a funding source is attached,
    // tracked separately on users.dwolla_funding_source_status.
    const client = getDwollaClient()
    const res = await client.get(`customers/${connectedAccountId}`)
    return res.body.status !== 'suspended' && res.body.status !== 'deactivated'
  },
}
