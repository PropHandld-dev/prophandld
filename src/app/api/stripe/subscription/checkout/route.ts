import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe, tierForUnitCount, priceIdForTier } from '@/lib/stripe'

export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.user_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords have a platform subscription' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  try {
    const { data: properties } = await supabaseAdmin
      .from('properties')
      .select('id')
      .eq('owner_user_id', user.id)

    const propertyIds = (properties || []).map((p) => p.id)
    let unitCount = 0
    if (propertyIds.length > 0) {
      const { count } = await supabaseAdmin
        .from('units')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propertyIds)
      unitCount = count || 0
    }

    const tier = tierForUnitCount(unitCount)
    const priceId = priceIdForTier(tier)

    if (tier === 'free' || !priceId) {
      return NextResponse.json({ error: 'No paid plan needed at your current unit count.' }, { status: 400 })
    }

    const { data: userRow, error: userRowError } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id, email, full_name')
      .eq('id', user.id)
      .maybeSingle()

    if (userRowError) {
      console.error('subscription/checkout: error fetching user row', userRowError)
      return NextResponse.json({ error: 'Could not load account' }, { status: 500 })
    }

    const stripe = getStripe()
    let customerId = userRow?.stripe_customer_id as string | null

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userRow?.email || user.email || undefined,
        name: userRow?.full_name || undefined,
        metadata: { prophandld_user_id: user.id },
      })
      customerId = customer.id
      await supabaseAdmin
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://prophandld.com'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/profile?billing=success`,
      cancel_url: `${origin}/profile?billing=cancelled`,
      metadata: { prophandld_landlord_user_id: user.id, prophandld_tier: tier },
      subscription_data: {
        metadata: { prophandld_landlord_user_id: user.id, prophandld_tier: tier },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('subscription/checkout: unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
