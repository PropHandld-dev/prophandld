import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getPlaidClient } from '@/lib/plaid'

export const maxDuration = 20

// One Link token per request, used once to open Plaid Link client-side.
// Auth-only product: all this needs is enough to create an ACH-eligible
// funding source later (routing/account numbers), nothing transaction- or
// identity-related.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const plaid = getPlaidClient()
    const response = await plaid.link.createToken({
      client_name: 'Prophandld',
      language: 'en',
      country_codes: ['US'],
      user: { client_user_id: user.id },
      products: ['auth'],
      account_filters: { depository: { account_subtypes: ['checking', 'savings'] } },
    })
    return NextResponse.json({ linkToken: response.link_token })
  } catch (err) {
    console.error('plaid/link-token: error creating link token', err)
    return NextResponse.json({ error: 'Could not start bank linking' }, { status: 500 })
  }
}
