import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getExchangePartnerByName, createExchangeSession, getExchangeSessionLinkToken, dwollaCustomerUrl } from '@/lib/dwolla'

export const maxDuration = 20

// Renters only — landlords only ever receive rent, and a manually-entered
// funding source can receive immediately without instant verification (see
// funding-source/add), so they never need this flow.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'renter') {
    return NextResponse.json({ error: 'Only renters link a bank this way' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: userRow, error: userRowError } = await supabaseAdmin
    .from('users')
    .select('dwolla_customer_id')
    .eq('id', user.id)
    .maybeSingle()

  if (userRowError || !userRow?.dwolla_customer_id) {
    return NextResponse.json({ error: 'Set up your account first' }, { status: 400 })
  }

  try {
    const plaid = await getExchangePartnerByName('Plaid')
    const sessionUrl = await createExchangeSession(dwollaCustomerUrl(userRow.dwolla_customer_id), plaid.href)
    const linkToken = await getExchangeSessionLinkToken(sessionUrl)
    return NextResponse.json({ linkToken })
  } catch (err: any) {
    console.error('dwolla/exchange-session/create: dwolla call failed', err?.body || err)
    return NextResponse.json({ error: 'Could not start instant bank verification' }, { status: 500 })
  }
}
