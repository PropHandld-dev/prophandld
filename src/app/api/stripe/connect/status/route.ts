import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe, isPayoutReady } from '@/lib/stripe'

export const maxDuration = 20

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

  // Previously unguarded: a Stripe connection hiccup here threw unhandled,
  // which StripeConnectCard's load() quietly swallowed into "not_started"
  // — misreporting a landlord/contractor whose payouts are already active
  // as not set up, purely because this one status check hit a transient
  // network error. Falling back to the last-known DB status is strictly
  // better than a wrong, scarier status while the real error is logged.
  try {
    const stripe = getStripe()
    const account = await stripe.accounts.retrieve(userRow.stripe_connect_account_id)
    const status = isPayoutReady(account) ? 'active' : 'onboarding'

    if (status !== userRow.stripe_connect_status) {
      await supabaseAdmin
        .from('users')
        .update({ stripe_connect_status: status })
        .eq('id', user.id)
    }

    // Why it isn't active yet, in Stripe's own words, so the card can say
    // "Stripe is verifying your details" or "Stripe still needs X" instead
    // of a vague "setup in progress". Only the caller's own account.
    const req = account.requirements
    const detail = status === 'active' ? null : {
      needs: Array.from(new Set([...(req?.past_due || []), ...(req?.currently_due || [])])),
      verifying: req?.pending_verification || [],
      disabledReason: req?.disabled_reason || null,
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled,
      transfers: account.capabilities?.transfers || null,
      detailsSubmitted: !!account.details_submitted,
    }
    return NextResponse.json({ status, detail })
  } catch (err) {
    console.error('connect/status: stripe call failed', err)
    return NextResponse.json({ status: userRow.stripe_connect_status || 'onboarding' })
  }
}
