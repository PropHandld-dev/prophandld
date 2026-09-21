import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe, isPayoutReady } from '@/lib/stripe'

function toE164(phone: string | null | undefined) {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return undefined
}

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
      .select('stripe_connect_account_id, email, full_name, phone')
      .eq('id', user.id)
      .maybeSingle()

    if (userRowError) {
      console.error('connect/onboard: error fetching user row', userRowError)
      return NextResponse.json({ error: 'Could not load account' }, { status: 500 })
    }

    let accountId = userRow?.stripe_connect_account_id as string | null

    const businessProfile = {
      mcc: role === 'landlord' ? '6513' : '1799',
      url: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com',
      product_description: role === 'landlord'
        ? 'Rental property owner receiving rent payments through Prophandld'
        : 'Home repair and maintenance contractor paid for jobs through Prophandld',
    }

    // Everything we already know, so Stripe doesn't ask for it again.
    const nameParts = (userRow?.full_name || '').trim().split(/\s+/).filter(Boolean)
    const phone = toE164(userRow?.phone)
    const individual = {
      ...(nameParts.length > 0 ? { first_name: nameParts[0] } : {}),
      ...(nameParts.length > 1 ? { last_name: nameParts.slice(1).join(' ') } : {}),
      ...(userRow?.email || user.email ? { email: userRow?.email || user.email! } : {}),
      ...(phone ? { phone } : {}),
    }

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
        business_profile: businessProfile,
        individual,
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

    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'
    const returnPath = role === 'landlord' ? '/profile' : '/contractor/settings'

    const account = await stripe.accounts.retrieve(accountId)
    if (isPayoutReady(account)) {
      const loginLink = await stripe.accounts.createLoginLink(accountId)
      return NextResponse.json({ url: loginLink.url })
    }

    // An account created before onboarding was simplified still carries
    // the extra card_payments requirements. Bring unfinished accounts in
    // line; best-effort, since Stripe may refuse to change a capability
    // that's already active.
    try {
      await stripe.accounts.update(accountId, {
        capabilities: { card_payments: { requested: false } },
        business_profile: businessProfile,
      })
    } catch (updateErr) {
      console.warn('connect/onboard: could not simplify existing account', updateErr)
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
