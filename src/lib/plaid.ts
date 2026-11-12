import { PlaidClient } from 'plaid'

let client: PlaidClient | null = null

export function getPlaidClient(): PlaidClient {
  if (!client) {
    const clientId = process.env.PLAID_CLIENT_ID
    const secret = process.env.PLAID_SECRET
    if (!clientId || !secret) {
      throw new Error('PLAID_CLIENT_ID/PLAID_SECRET are not set')
    }
    client = new PlaidClient({
      clientId,
      secret,
      environment: process.env.PLAID_ENV || 'sandbox',
    })
  }
  return client
}
