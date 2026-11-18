import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getProviderAdapter } from '@/lib/payments'
import { friendlyStripeError } from '@/lib/stripeErrorMessage'
import { getStripe } from '@/lib/stripe'

// This route makes up to 3 sequential Stripe calls in the worst case
// (retrieve, accounts.create, accountLinks.create) — the 10s default
// Vercel function timeout a retry or two of real network latency away
// from being hit, which surfaces to Stripe's own SDK as a connection
// error indistinguishable from a real outage. Raising this is free and
// directly addresses the likely cause of a "retried 2 times" report.
export const maxDuration = 30

// Connect account creation always goes through the Stripe adapter
// directly (not getProviderAdapter(user's ach_provider)) — the payout
// account itself is Stripe-specific infrastructure, separate from which
// provider eventually processes an individual ACH charge against it.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const role = user.app_metadata?.role
  if (role !== 'landlord' && role !== 'contractor') {
    return NextResponse.json({ error: 'Only landlords and contractors can set up payouts' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const adapter = getProviderAdapter('stripe')

  try {
    const { data: userRow, error: userRowError } = await supabaseAdmin
      .from('users')
      .select('stripe_connect_account_id, email, full_name, phone')
      .eq('id', user.id)
      .maybeSingle()

    if (userRowError) {
      console.error('connect/onboard: error fetching user row', userRowError)
      return NextResponse.json({ error: 'Could not load account' }, { status: 500 })
    }

    const existingAccountId = (userRow?.stripe_connect_account_id as string | null) ?? null
    const returnPath = role === 'landlord' ? '/profile' : '/contractor/settings'

    if (existingAccountId && (await adapter.isPayoutReady(existingAccountId))) {
      // Already fully onboarded — send them to their own Stripe dashboard
      // (controller.stripe_dashboard: 'full' from account creation is what
      // makes this a real, full dashboard login, not an Express one).
      const stripe = getStripe()
      const loginLink = await stripe.accounts.createLoginLink(existingAccountId)
      return NextResponse.json({ url: loginLink.url })
    }

    const { url, accountId } = await adapter.getOnboardingLink({
      userId: user.id,
      existingAccountId,
      email: userRow?.email || user.email || null,
      fullName: userRow?.full_name || null,
      phone: userRow?.phone || null,
      role,
      returnPath,
    })

    if (!existingAccountId) {
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ stripe_connect_account_id: accountId, stripe_connect_status: 'onboarding' })
        .eq('id', user.id)

      if (updateError) {
        console.error('connect/onboard: error saving connect account id', updateError)
        return NextResponse.json({ error: 'Could not save payout account' }, { status: 500 })
      }
    }

    return NextResponse.json({ url })
  } catch (err) {
    console.error('connect/onboard: unhandled error', err)
    return NextResponse.json({ error: friendlyStripeError(err, 'set up payouts') }, { status: 500 })
  }
}
