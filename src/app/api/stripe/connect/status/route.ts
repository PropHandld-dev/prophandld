import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: userRow, error: userRowError } = await supabaseAdmin
    .from('users')
    .select('stripe_connect_account_id, stripe_connect_status')
    .eq('id', user.id)
    .maybeSingle()

  if (userRowError) {
    console.error('connect/status: error fetching user row', userRowError)
    return NextResponse.json({ error: 'Could not load payout status' }, { status: 500 })
  }

  if (!userRow?.stripe_connect_account_id) {
    return NextResponse.json({ status: 'not_started' })
  }

  const stripe = getStripe()
  const account = await stripe.accounts.retrieve(userRow.stripe_connect_account_id)
  const status = account.charges_enabled && account.payouts_enabled ? 'active' : 'onboarding'

  if (status !== userRow.stripe_connect_status) {
    await supabaseAdmin
      .from('users')
      .update({ stripe_connect_status: status })
      .eq('id', user.id)
  }

  return NextResponse.json({ status })
}
