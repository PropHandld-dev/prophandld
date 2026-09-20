import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'

export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const role = user.user_metadata?.role
  if (role !== 'landlord' && role !== 'contractor') {
    return NextResponse.json({ error: 'Only landlords and contractors can set up payouts' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const stripe = getStripe()

  try {
    const { data: userRow, error: userRowError } = await supabaseAdmin
      .from('users')
      .select('stripe_connect_account_id, email, full_name')
      .eq('id', user.id)
      .maybeSingle()

    if (userRowError) {
      console.error('connect/onboard: error fetching user row', userRowError)
      return NextResponse.json({ error: 'Could not load account' }, { status: 500 })
    }

    let accountId = userRow?.stripe_connect_account_id as string | null

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: userRow?.email || user.email || undefined,
        business_type: 'individual',
        // Payments are destination charges with Prophandld as the merchant,
        // so payout accounts only receive transfers. Requesting
        // card_payments is what made Stripe ask each person for a website,
        // statement descriptor and product description.
        capabilities: {
          transfers: { requested: true },
        },
        business_profile: {
          mcc: role === 'landlord' ? '6513' : '1799',
          url: process.env.NEXT_PUBLIC_SITE_URL || 'https://prophandld.com',
          product_description: role === 'landlord'
            ? 'Rental property owner receiving rent payments through Prophandld'
            : 'Home repair and maintenance contractor paid for jobs through Prophandld',
        },
        metadata: {
          prophandld_user_id: user.id,
          prophandld_role: role,
        },
      })
      accountId = account.id

      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ stripe_connect_account_id: accountId, stripe_connect_status: 'onboarding' })
        .eq('id', user.id)

      if (updateError) {
        console.error('connect/onboard: error saving connect account id', updateError)
        return NextResponse.json({ error: 'Could not save payout account' }, { status: 500 })
      }
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://prophandld.com'
    const returnPath = role === 'landlord' ? '/profile' : '/contractor/settings'

    const account = await stripe.accounts.retrieve(accountId)
    if (account.charges_enabled && account.payouts_enabled) {
      const loginLink = await stripe.accounts.createLoginLink(accountId)
      return NextResponse.json({ url: loginLink.url })
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}${returnPath}?stripe=refresh`,
      return_url: `${origin}${returnPath}?stripe=return`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (err) {
    console.error('connect/onboard: unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
