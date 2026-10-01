import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'
import { friendlyStripeError } from '@/lib/stripeErrorMessage'

export const maxDuration = 15

export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!userRow?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account yet. Subscribe first.' }, { status: 400 })
  }

  const stripe = getStripe()
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: userRow.stripe_customer_id,
      return_url: `${origin}/profile`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('billing-portal: unhandled error', err)
    return NextResponse.json({ error: friendlyStripeError(err, 'open your billing portal') }, { status: 500 })
  }
}
