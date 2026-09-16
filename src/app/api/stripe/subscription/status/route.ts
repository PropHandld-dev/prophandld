import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { tierForUnitCount } from '@/lib/stripe'

export async function GET() {
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
    const { data: properties, error: propertiesError } = await supabaseAdmin
      .from('properties')
      .select('id')
      .eq('owner_user_id', user.id)

    if (propertiesError) {
      console.error('subscription/status: error fetching properties', propertiesError)
      return NextResponse.json({ error: 'Could not load properties' }, { status: 500 })
    }

    const propertyIds = (properties || []).map((p) => p.id)
    let unitCount = 0
    if (propertyIds.length > 0) {
      const { count, error: unitsError } = await supabaseAdmin
        .from('units')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propertyIds)
      if (unitsError) {
        console.error('subscription/status: error counting units', unitsError)
        return NextResponse.json({ error: 'Could not count units' }, { status: 500 })
      }
      unitCount = count || 0
    }

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('landlord_subscriptions')
      .select('tier, stripe_subscription_id, status')
      .eq('landlord_user_id', user.id)
      .maybeSingle()

    if (subscriptionError) {
      console.error('subscription/status: error fetching subscription', subscriptionError)
      return NextResponse.json({ error: 'Could not load subscription' }, { status: 500 })
    }

    const { data: userRow, error: userRowError } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle()

    if (userRowError) {
      console.error('subscription/status: error fetching user row', userRowError)
      return NextResponse.json({ error: 'Could not load account' }, { status: 500 })
    }

    return NextResponse.json({
      unitCount,
      computedTier: tierForUnitCount(unitCount),
      tier: subscription?.tier || 'free',
      hasActiveSubscription: !!subscription?.stripe_subscription_id && subscription.status === 'active',
      hasStripeCustomer: !!userRow?.stripe_customer_id,
    })
  } catch (err) {
    console.error('subscription/status: unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
