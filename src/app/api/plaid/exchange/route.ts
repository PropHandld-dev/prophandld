import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPlaidClient } from '@/lib/plaid'

export const maxDuration = 20

// Stores the link, not a processor token -- Stripe's bank_account_token
// and Dwolla's processor token are both effectively single-use, so they
// get minted on demand wherever they're actually needed (see
// dwollaProvider.ts's createDwollaFundingSourceFromPlaidToken), not here.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { publicToken, accountId } = (await request.json()) as { publicToken?: string; accountId?: string }
  if (!publicToken || !accountId) {
    return NextResponse.json({ error: 'Missing publicToken or accountId' }, { status: 400 })
  }

  try {
    const plaid = getPlaidClient()
    const exchange = await plaid.item.exchangePublicToken({ public_token: publicToken })

    const supabaseAdmin = getSupabaseAdmin()
    await supabaseAdmin
      .from('users')
      .update({
        plaid_item_id: exchange.item_id,
        plaid_access_token: exchange.access_token,
        plaid_account_id: accountId,
      })
      .eq('id', user.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('plaid/exchange: error exchanging public token', err)
    return NextResponse.json({ error: 'Could not link that bank account' }, { status: 500 })
  }
}
