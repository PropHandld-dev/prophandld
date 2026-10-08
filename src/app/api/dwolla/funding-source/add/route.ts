import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { addFundingSourceByAccountNumber, dwollaCustomerUrl, initiateMicroDeposits } from '@/lib/dwolla'

export const maxDuration = 20

// Manual routing/account entry — works today without waiting on Dwolla to
// enable instant verification (Exchange Sessions) on this account. A
// funding source created this way can RECEIVE transfers immediately even
// while unverified, so this is the right path for landlords regardless of
// how the renter-side bank-linking decision resolves (see dwolla.ts).
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { routingNumber, accountNumber, bankAccountType, name } = (await request.json()) as {
    routingNumber?: string
    accountNumber?: string
    bankAccountType?: 'checking' | 'savings'
    name?: string
  }
  if (!routingNumber?.trim() || !accountNumber?.trim() || !bankAccountType) {
    return NextResponse.json({ error: 'Missing routing number, account number, or account type' }, { status: 400 })
  }

  const role = user.app_metadata?.role

  const supabaseAdmin = getSupabaseAdmin()
  const { data: userRow, error: userRowError } = await supabaseAdmin
    .from('users')
    .select('dwolla_customer_id')
    .eq('id', user.id)
    .maybeSingle()

  if (userRowError || !userRow?.dwolla_customer_id) {
    return NextResponse.json({ error: 'Set up your Dwolla account first' }, { status: 400 })
  }

  try {
    const fundingSource = await addFundingSourceByAccountNumber({
      customerUrl: dwollaCustomerUrl(userRow.dwolla_customer_id),
      routingNumber: routingNumber.trim(),
      accountNumber: accountNumber.trim(),
      bankAccountType,
      name: name?.trim() || 'Bank account',
    })

    // A funding source can RECEIVE transfers immediately even while
    // unverified — only SENDING requires the micro-deposit round trip.
    // Landlords only ever receive rent here (Prophandld's facilitator
    // account creates the transfer; the landlord's funding source is just
    // the destination), so they skip straight to active regardless of
    // their Dwolla Customer type. Renters send, so they always need it.
    const onlyReceives = role === 'landlord'
    if (!onlyReceives) {
      await initiateMicroDeposits(fundingSource.url)
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        dwolla_funding_source_id: fundingSource.id,
        dwolla_funding_source_status: onlyReceives ? 'verified' : 'pending',
        dwolla_customer_status: onlyReceives ? 'active' : 'pending',
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('dwolla/funding-source/add: error saving funding source', updateError)
      return NextResponse.json({ error: 'Could not save bank account' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, needsMicroDepositVerification: !onlyReceives })
  } catch (err: any) {
    console.error('dwolla/funding-source/add: dwolla call failed', err?.body || err)
    const dwollaMessage = err?.body?._embedded?.errors?.[0]?.message
    return NextResponse.json({ error: dwollaMessage || 'Could not add bank account' }, { status: 400 })
  }
}
