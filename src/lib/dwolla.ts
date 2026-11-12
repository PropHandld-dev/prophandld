import { Client } from 'dwolla-v2'

let client: Client | null = null

// dwolla-v2 handles the OAuth client-credentials exchange internally per
// request -- no separate token-refresh bookkeeping needed here, unlike a
// raw REST client.
export function getDwollaClient(): Client {
  if (!client) {
    const key = process.env.DWOLLA_KEY
    const secret = process.env.DWOLLA_SECRET
    if (!key || !secret) {
      throw new Error('DWOLLA_KEY/DWOLLA_SECRET are not set')
    }
    client = new Client({
      key,
      secret,
      environment: (process.env.DWOLLA_ENVIRONMENT as 'production' | 'sandbox') || 'sandbox',
    })
  }
  return client
}

// Every Dwolla resource URL (customer, funding source, transfer) is
// returned as a full href, e.g. https://api-sandbox.dwolla.com/transfers/<id>.
// dwolla-v2's get/post take a path, not a full URL, but accept one anyway --
// kept as a named helper since every call site needs this, and it reads
// clearer than re-deriving the id from the URL each time.
export function dwollaIdFromUrl(url: string): string {
  return url.split('/').pop() as string
}

export function dwollaApiUrl(): string {
  return (process.env.DWOLLA_ENVIRONMENT || 'sandbox') === 'production'
    ? 'https://api.dwolla.com'
    : 'https://api-sandbox.dwolla.com'
}
