import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import {
  getExchangePartnerByName,
  createExchangeFromPlaidPublicToken,
  createFundingSourceFromExchange,
  dwollaCustomerUrl,
} from '@/lib/dwolla'

export const maxDuration = 20

// Takes the publicToken Plaid Link handed the client on success, and turns
// it into an already-verified Dwolla funding source — no micro-deposits.
// The exchange partner href is re-looked-up server-side rather than trusted
// from the client, same reasoning as never trusting a client-supplied URL
// that gets used in a server-side Dwolla call.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'renter') {
    return NextResponse.json({ error: 'Only renters link a bank this way' }, { status: 403 })
  }

  const { publicToken, bankAccountType, name } = (await request.json()) as {
    publicToken?: string
    bankAccountType?: 'checking' | 'savings'
    name?: string
  }
  if (!publicToken) {
    return NextResponse.json({ error: 'Missing bank link token' }, { status: 400 })
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
    const customerUrl = dwollaCustomerUrl(userRow.dwolla_customer_id)
    const exchangeUrl = await createExchangeFromPlaidPublicToken({
      customerUrl,
      exchangePartnerHref: plaid.href,
      publicToken,
    })
    const fundingSource = await createFundingSourceFromExchange({
      customerUrl,
      exchangeUrl,
      bankAccountType: bankAccountType === 'savings' ? 'savings' : 'checking',
      name: name?.trim() || 'Bank account',
    })

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        dwolla_funding_source_id: fundingSource.id,
        dwolla_funding_source_status: 'verified',
        dwolla_customer_status: 'active',
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('dwolla/exchange/complete: error saving funding source', updateError)
      return NextResponse.json({ error: 'Could not save bank account' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('dwolla/exchange/complete: dwolla call failed', err?.body || err)
    const dwollaMessage = err?.body?._embedded?.errors?.[0]?.message
    return NextResponse.json({ error: dwollaMessage || 'Could not link your bank account' }, { status: 400 })
  }
}
