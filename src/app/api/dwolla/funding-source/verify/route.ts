import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { dwollaFundingSourceUrl, verifyMicroDeposits } from '@/lib/dwolla'

export const maxDuration = 20

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { amount1, amount2 } = (await request.json()) as { amount1?: number; amount2?: number }
  if (typeof amount1 !== 'number' || typeof amount2 !== 'number') {
    return NextResponse.json({ error: 'Enter both deposit amounts' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: userRow, error: userRowError } = await supabaseAdmin
    .from('users')
    .select('dwolla_funding_source_id')
    .eq('id', user.id)
    .maybeSingle()

  if (userRowError || !userRow?.dwolla_funding_source_id) {
    return NextResponse.json({ error: 'No bank account to verify' }, { status: 400 })
  }

  try {
    await verifyMicroDeposits(dwollaFundingSourceUrl(userRow.dwolla_funding_source_id), amount1, amount2)

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ dwolla_funding_source_status: 'verified', dwolla_customer_status: 'active' })
      .eq('id', user.id)

    if (updateError) {
      console.error('dwolla/funding-source/verify: error saving verified status', updateError)
      return NextResponse.json({ error: 'Could not save verification' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('dwolla/funding-source/verify: dwolla call failed', err?.body || err)
    // Dwolla returns a specific error when the amounts are wrong, with a
    // limited number of attempts before the funding source is locked —
    // surface its message rather than a generic one so the user knows
    // whether to retry or re-add the account from scratch.
    const dwollaMessage = err?.body?._embedded?.errors?.[0]?.message
    return NextResponse.json({ error: dwollaMessage || 'Those amounts didn’t match. Check your bank statement and try again.' }, { status: 400 })
  }
}
