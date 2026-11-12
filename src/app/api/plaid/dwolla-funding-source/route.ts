import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPlaidClient } from '@/lib/plaid'
import { createDwollaFundingSourceFromPlaidToken } from '@/lib/payments/dwollaProvider'

export const maxDuration = 20

// The actual Plaid+Dwolla payoff: a bank already linked through Plaid
// (via /api/plaid/exchange) becomes a verified Dwolla funding source with
// no further bank interaction from the user -- no micro-deposits, no
// re-entering routing/account numbers. Requires a dwolla_customer_id to
// already exist (created during onboarding, see dwollaProvider's
// getOnboardingLink), so this is step two of linking a bank for Dwolla,
// never step one.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: row } = await supabaseAdmin
    .from('users')
    .select('plaid_access_token, plaid_account_id, dwolla_customer_id, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!row?.plaid_access_token || !row.plaid_account_id) {
    return NextResponse.json({ error: 'Link a bank account first' }, { status: 400 })
  }
  if (!row.dwolla_customer_id) {
    return NextResponse.json({ error: 'No Dwolla account set up for this user yet' }, { status: 400 })
  }

  try {
    const plaid = getPlaidClient()
    const { processor_token } = await plaid.processor.createToken({
      access_token: row.plaid_access_token,
      account_id: row.plaid_account_id,
      processor: 'dwolla',
    })

    const fundingSourceId = await createDwollaFundingSourceFromPlaidToken({
      dwollaCustomerId: row.dwolla_customer_id,
      plaidProcessorToken: processor_token,
      bankAccountType: 'checking',
      name: row.full_name ? `${row.full_name}'s bank account` : 'Bank account',
    })

    await supabaseAdmin
      .from('users')
      .update({ dwolla_funding_source_id: fundingSourceId, dwolla_funding_source_status: 'verified' })
      .eq('id', user.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('plaid/dwolla-funding-source: error', err)
    return NextResponse.json({ error: 'Could not finish linking that bank account' }, { status: 500 })
  }
}
