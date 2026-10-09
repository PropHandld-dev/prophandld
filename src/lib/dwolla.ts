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

// Landlords receive rent. Receive-only (name + email only) was the first
// choice here since landlords never send — but Dwolla's transfer rules
// turned out to block an Unverified sender (the renter) from reaching a
// Receive-Only recipient at all ("Receiver cannot receive from sender"),
// confirmed against a real sandbox transfer attempt. Verified Customer is
// the type that can actually receive from an Unverified sender, so
// landlords go through full identity verification instead — the same
// SSN/DOB/address Stripe Connect Express already collects from them
// today, not a new category of data being asked for.
export async function createVerifiedPersonalCustomer({
  firstName,
  lastName,
  email,
  address1,
  city,
  state,
  postalCode,
  dateOfBirth,
  ssnLast4,
  idempotencyKey,
}: {
  firstName: string
  lastName: string
  email: string
  address1: string
  city: string
  state: string
  postalCode: string
  dateOfBirth: string
  ssnLast4: string
  idempotencyKey: string
}): Promise<DwollaCustomer> {
  const dwolla = getDwollaClient()
  const res = await dwolla.post(
    'customers',
    {
      firstName,
      lastName,
      email,
      type: 'personal',
      address1,
      city,
      state,
      postalCode,
      dateOfBirth,
      ssn: ssnLast4,
    },
    // Keyed on the caller's own user id — a double-click or a retried
    // request reuses the same key, so Dwolla returns the same customer
    // instead of creating a second one.
    { 'Idempotency-Key': idempotencyKey }
  )
  const url = res.headers.get('location')!
  return { id: url.split('/').pop()!, url, type: 'verified', status: 'unverified' }
}

// Upgrades an EXISTING customer (the pre-fix 'receive-only' landlords from
// before Verified Customer became the right type — see above) in place,
// rather than creating a second Dwolla Customer resource. Necessary
// because Dwolla customers are unique per email: calling the plain create
// endpoint again for the same landlord fails with
// `{"code":"Duplicate","message":"A customer with the specified email
// already exists."}`, confirmed against a real sandbox account stuck in
// exactly this state. This is a different HTTP verb/shape than creation —
// POST to the existing customer's own URL, 200 with a JSON body (not a
// 201 + empty body + Location header).
export async function upgradeToVerifiedPersonal({
  customerUrl,
  firstName,
  lastName,
  email,
  address1,
  city,
  state,
  postalCode,
  dateOfBirth,
  ssnLast4,
}: {
  customerUrl: string
  firstName: string
  lastName: string
  email: string
  address1: string
  city: string
  state: string
  postalCode: string
  dateOfBirth: string
  ssnLast4: string
}): Promise<DwollaCustomer> {
  const dwolla = getDwollaClient()
  const res = await dwolla.post(customerUrl, {
    firstName,
    lastName,
    email,
    type: 'personal',
    address1,
    city,
    state,
    postalCode,
    dateOfBirth,
    ssn: ssnLast4,
  })
  const body = res.body as { id: string; status: string }
  return { id: body.id, url: customerUrl, type: 'verified', status: body.status }
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
  idempotencyKey,
}: {
  firstName: string
  lastName: string
  email: string
  ipAddress: string
  idempotencyKey: string
}): Promise<DwollaCustomer> {
  const dwolla = getDwollaClient()
  const res = await dwolla.post(
    'customers',
    {
      firstName,
      lastName,
      email,
      type: 'unverified',
      ipAddress,
    },
    { 'Idempotency-Key': idempotencyKey }
  )
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

type ExchangePartner = { id: string; href: string; name: string }

// Looked up by name every call rather than hardcoded, since a partner's id
// differs between sandbox and production — this works unmodified across
// both.
export async function getExchangePartnerByName(name: string): Promise<ExchangePartner> {
  const dwolla = getDwollaClient()
  const res = await dwolla.get('exchange-partners')
  const partners = (res.body._embedded?.['exchange-partners'] || []) as Array<{
    id: string
    name: string
    _links: { self: { href: string } }
  }>
  const match = partners.find((p) => p.name.toLowerCase() === name.toLowerCase())
  if (!match) {
    throw new Error(`Exchange partner "${name}" not found or not enabled on this Dwolla account`)
  }
  return { id: match.id, href: match._links.self.href, name: match.name }
}

// Instant bank verification (Plaid, via Dwolla's Exchange Sessions / Open
// Banking) — skips the 1-2 day micro-deposit wait entirely. Dwolla brokers
// the whole Plaid relationship; no separate Plaid API key is needed here.
// Exchange sessions are single-use: a fresh one is created every time a
// renter opens the bank-link flow.
export async function createExchangeSession(customerUrl: string, exchangePartnerHref: string): Promise<string> {
  const dwolla = getDwollaClient()
  const res = await dwolla.post(`${customerUrl}/exchange-sessions`, {
    _links: { 'exchange-partner': { href: exchangePartnerHref } },
  })
  return res.headers.get('location')!
}

// The externalProviderSessionToken is Plaid's own Link token — handed
// straight to react-plaid-link's usePlaidLink({ token }) on the client.
export async function getExchangeSessionLinkToken(exchangeSessionUrl: string): Promise<string> {
  const dwolla = getDwollaClient()
  const res = await dwolla.get(exchangeSessionUrl)
  const token = res.body.externalProviderSessionToken as string | undefined
  if (!token) throw new Error('Exchange session did not return a Plaid link token')
  return token
}

// Plaid Link's onSuccess hands back a publicToken; this converts it into a
// Dwolla "exchange" resource, which createFundingSourceFromExchange below
// then turns into an already-verified funding source — no micro-deposits.
export async function createExchangeFromPlaidPublicToken({
  customerUrl,
  exchangePartnerHref,
  publicToken,
}: {
  customerUrl: string
  exchangePartnerHref: string
  publicToken: string
}): Promise<string> {
  const dwolla = getDwollaClient()
  const res = await dwolla.post(`${customerUrl}/exchanges`, {
    _links: { 'exchange-partner': { href: exchangePartnerHref } },
    plaid: { publicToken },
  })
  return res.headers.get('location')!
}

export async function createFundingSourceFromExchange({
  customerUrl,
  exchangeUrl,
  bankAccountType,
  name,
}: {
  customerUrl: string
  exchangeUrl: string
  bankAccountType: 'checking' | 'savings'
  name: string
}): Promise<DwollaFundingSource> {
  const dwolla = getDwollaClient()
  const res = await dwolla.post(`${customerUrl}/funding-sources`, {
    _links: { exchange: { href: exchangeUrl } },
    bankAccountType,
    name,
  })
  const url = res.headers.get('location')!
  return { id: url.split('/').pop()!, url, status: 'verified' }
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
