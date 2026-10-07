import { Client } from 'dwolla-v2'
import crypto from 'crypto'

// Server-only. Built lazily so a missing DWOLLA_KEY doesn't crash the build
// — same reasoning as getStripe() in lib/stripe.ts. dwolla-v2's Client
// manages the OAuth2 client-credentials token internally (re-authenticates
// as needed), so there's no manual token cache to maintain here the way a
// hand-rolled fetch wrapper would need.
let dwollaClient: Client | null = null

export function getDwollaClient() {
  if (!dwollaClient) {
    // .trim() for the same reason as getStripe(): a trailing newline/space
    // pasted into Vercel's env var dashboard produces an auth failure that
    // looks like a network problem, not a formatting one.
    dwollaClient = new Client({
      key: process.env.DWOLLA_KEY!.trim(),
      secret: process.env.DWOLLA_SECRET!.trim(),
      environment: process.env.DWOLLA_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
    })
  }
  return dwollaClient
}

export function getDwollaDashboardBase() {
  return process.env.DWOLLA_ENVIRONMENT === 'production'
    ? 'https://dashboard.dwolla.com'
    : 'https://dashboard-sandbox.dwolla.com'
}

type DwollaCustomer = {
  id: string
  url: string
  type: 'receive-only' | 'unverified' | 'verified' | 'business'
  status: string
}

// Landlords only ever receive rent — the lightest Dwolla Customer type
// (name + email only, no SSN/EIN) is the correct fit, not an
// under-verification of a sending party.
export async function createReceiveOnlyCustomer({
  firstName,
  lastName,
  email,
}: {
  firstName: string
  lastName: string
  email: string
}): Promise<DwollaCustomer> {
  const dwolla = getDwollaClient()
  const res = await dwolla.post('customers', {
    firstName,
    lastName,
    email,
    type: 'receive-only',
  })
  const url = res.headers.get('location')!
  return { id: url.split('/').pop()!, url, type: 'receive-only', status: 'unverified' }
}

// Renters send rent. 'unverified' is deliberate, not a corner cut — rent
// payments are always well under Dwolla's $5,000/week Unverified send
// limit, and it avoids ever collecting a renter's SSN just to pay rent.
// ipAddress is required by Dwolla for this customer type (fraud signal at
// signup), so the caller must pass the request's real client IP.
export async function createSendingCustomer({
  firstName,
  lastName,
  email,
  ipAddress,
}: {
  firstName: string
  lastName: string
  email: string
  ipAddress: string
}): Promise<DwollaCustomer> {
  const dwolla = getDwollaClient()
  const res = await dwolla.post('customers', {
    firstName,
    lastName,
    email,
    type: 'unverified',
    ipAddress,
  })
  const url = res.headers.get('location')!
  return { id: url.split('/').pop()!, url, type: 'unverified', status: 'unverified' }
}

export async function getCustomer(customerUrl: string) {
  const dwolla = getDwollaClient()
  const res = await dwolla.get(customerUrl)
  return res.body as { id: string; type: string; status: string }
}

type DwollaFundingSource = {
  id: string
  url: string
  status: 'unverified' | 'verified'
}

// Manual routing/account entry — works today without any additional Dwolla
// account configuration. A funding source created this way can RECEIVE
// transfers immediately even while 'unverified'; it can only SEND once
// verified (via micro-deposits, or instant verification once that's
// enabled on the account). See initiateMicroDeposits/verifyMicroDeposits
// below for the sending-side path.
export async function addFundingSourceByAccountNumber({
  customerUrl,
  routingNumber,
  accountNumber,
  bankAccountType,
  name,
}: {
  customerUrl: string
  routingNumber: string
  accountNumber: string
  bankAccountType: 'checking' | 'savings'
  name: string
}): Promise<DwollaFundingSource> {
  const dwolla = getDwollaClient()
  const res = await dwolla.post(`${customerUrl}/funding-sources`, {
    routingNumber,
    accountNumber,
    bankAccountType,
    name,
  })
  const url = res.headers.get('location')!
  return { id: url.split('/').pop()!, url, status: 'unverified' }
}

export async function initiateMicroDeposits(fundingSourceUrl: string) {
  const dwolla = getDwollaClient()
  await dwolla.post(`${fundingSourceUrl}/micro-deposits`)
}

export async function verifyMicroDeposits(fundingSourceUrl: string, amount1: number, amount2: number) {
  const dwolla = getDwollaClient()
  await dwolla.post(`${fundingSourceUrl}/micro-deposits`, {
    amount1: { value: amount1.toFixed(2), currency: 'USD' },
    amount2: { value: amount2.toFixed(2), currency: 'USD' },
  })
}

export async function getFundingSource(fundingSourceUrl: string) {
  const dwolla = getDwollaClient()
  const res = await dwolla.get(fundingSourceUrl)
  return res.body as { id: string; status: 'unverified' | 'verified'; removed: boolean; name: string }
}

export async function getFundingSourcesForCustomer(customerUrl: string) {
  const dwolla = getDwollaClient()
  const res = await dwolla.get(`${customerUrl}/funding-sources`)
  return (res.body._embedded?.['funding-sources'] || []) as Array<{
    id: string
    status: 'unverified' | 'verified'
    removed: boolean
    _links: { self: { href: string } }
  }>
}

type DwollaTransfer = {
  id: string
  url: string
}

// No `fees` array — Prophandld absorbs its own Dwolla cost here exactly
// like it silently absorbed Stripe's ACH fee before this. correlationId
// carries the rent_payments.id so a webhook/confirm-route lookup never has
// to trust anything the client says, same spirit as Stripe's
// metadata.prophandld_rent_payment_id.
export async function createTransfer({
  sourceFundingSourceUrl,
  destinationFundingSourceUrl,
  amount,
  correlationId,
}: {
  sourceFundingSourceUrl: string
  destinationFundingSourceUrl: string
  amount: number
  correlationId: string
}): Promise<DwollaTransfer> {
  const dwolla = getDwollaClient()
  const res = await dwolla.post(
    'transfers',
    {
      _links: {
        source: { href: sourceFundingSourceUrl },
        destination: { href: destinationFundingSourceUrl },
      },
      amount: { currency: 'USD', value: amount.toFixed(2) },
      correlationId,
    },
    // Idempotency-Key prevents a double-click or a client retry from
    // creating two real transfers for the same rent payment — the same
    // protection the Stripe route gets for free from PaymentIntent reuse.
    { 'Idempotency-Key': correlationId }
  )
  const url = res.headers.get('location')!
  return { id: url.split('/').pop()!, url }
}

export async function getTransfer(transferUrl: string) {
  const dwolla = getDwollaClient()
  const res = await dwolla.get(transferUrl)
  return res.body as {
    id: string
    status: 'pending' | 'processed' | 'failed' | 'cancelled'
    amount: { value: string; currency: string }
    correlationId?: string
    created: string
  }
}

export function dwollaApiBase() {
  return process.env.DWOLLA_ENVIRONMENT === 'production' ? 'https://api.dwolla.com' : 'https://api-sandbox.dwolla.com'
}

export function dwollaTransferUrl(transferId: string) {
  return `${dwollaApiBase()}/transfers/${transferId}`
}

export function dwollaCustomerUrl(customerId: string) {
  return `${dwollaApiBase()}/customers/${customerId}`
}

export function dwollaFundingSourceUrl(fundingSourceId: string) {
  return `${dwollaApiBase()}/funding-sources/${fundingSourceId}`
}

// Dwolla doesn't auto-generate a webhook secret the way Stripe does — the
// caller picks one when creating the subscription (see the one-off setup
// script), then this same value is used both there and here.
export function verifyDwollaWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false
  const secret = process.env.DWOLLA_WEBHOOK_SECRET
  if (!secret) {
    console.error('verifyDwollaWebhookSignature: DWOLLA_WEBHOOK_SECRET is not set')
    return false
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  // Dwolla explicitly warns the JSON body must never be re-encoded before
  // hashing — a formatting difference (key order, whitespace) would make a
  // genuine Dwolla request fail verification. The caller must pass the raw
  // request text, not JSON.parse(...)'d and re-stringified.
  const expectedBuf = Buffer.from(expected, 'hex')
  const actualBuf = Buffer.from(signatureHeader, 'hex')
  if (expectedBuf.length !== actualBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, actualBuf)
}
