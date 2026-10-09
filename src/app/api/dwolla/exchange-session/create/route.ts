import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getExchangePartnerByName, createExchangeSession, getExchangeSessionLinkToken, createSendingCustomer, dwollaCustomerUrl } from '@/lib/dwolla'

export const maxDuration = 20

// Renters only — landlords only ever receive rent, and a manually-entered
// funding source can receive immediately without instant verification (see
// funding-source/add), so they never need this flow.
export async function POST(request: NextRequest) {
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
    .select('dwolla_customer_id, full_name, email')
    .eq('id', user.id)
    .maybeSingle()

  if (userRowError) {
    console.error('dwolla/exchange-session/create: error fetching user row', userRowError)
    return NextResponse.json({ error: 'Could not load your account' }, { status: 500 })
  }

  try {
    // First time through this flow — the Plaid Link step is usually a
    // renter's very first interaction with Dwolla, so there's no customer
    // to require ahead of time the way the old manual-entry wizard did.
    let customerId = userRow?.dwolla_customer_id
    if (!customerId) {
      const email = userRow?.email || user.email
      if (!email) {
        return NextResponse.json({ error: 'An email is required before setting this up' }, { status: 400 })
      }
      const nameParts = (userRow?.full_name || '').trim().split(/\s+/).filter(Boolean)
      const customer = await createSendingCustomer({
        firstName: nameParts[0] || 'Prophandld',
        lastName: nameParts.slice(1).join(' ') || 'User',
        email,
        ipAddress: (request.headers.get('x-forwarded-for') || '127.0.0.1').split(',')[0].trim(),
        idempotencyKey: user.id,
      })
      customerId = customer.id
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ dwolla_customer_id: customer.id, dwolla_customer_type: 'unverified', dwolla_customer_status: 'pending' })
        .eq('id', user.id)
      if (updateError) {
        console.error('dwolla/exchange-session/create: error saving new customer id', updateError)
        return NextResponse.json({ error: 'Could not save your account setup' }, { status: 500 })
      }
    }

    const plaid = await getExchangePartnerByName('Plaid')
    const sessionUrl = await createExchangeSession(dwollaCustomerUrl(customerId), plaid.href)
    const linkToken = await getExchangeSessionLinkToken(sessionUrl)
    return NextResponse.json({ linkToken })
  } catch (err: any) {
    console.error('dwolla/exchange-session/create: dwolla call failed', JSON.stringify(err?.body?._embedded?.errors || err?.body || err))
    return NextResponse.json({ error: 'Could not start instant bank verification' }, { status: 500 })
  }
}
