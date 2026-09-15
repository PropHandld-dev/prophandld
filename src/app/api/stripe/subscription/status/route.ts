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

  const { data: subscription } = await supabaseAdmin
    .from('landlord_subscriptions')
    .select('tier, stripe_subscription_id, status')
    .eq('landlord_user_id', user.id)
    .maybeSingle()

  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle()

  return NextResponse.json({
    unitCount,
    computedTier: tierForUnitCount(unitCount),
    tier: subscription?.tier || 'free',
    hasActiveSubscription: !!subscription?.stripe_subscription_id && subscription.status === 'active',
    hasStripeCustomer: !!userRow?.stripe_customer_id,
  })
}
