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

  const { data: properties, error: propertiesError } = await supabaseAdmin
    .from('properties')
    .select('id')
    .eq('owner_user_id', user.id)

  if (propertiesError) {
    console.error('subscription/sync: error fetching properties', propertiesError)
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
      console.error('subscription/sync: error counting units', unitsError)
      return NextResponse.json({ error: 'Could not count units' }, { status: 500 })
    }
    unitCount = count || 0
  }

  const desiredTier = tierForUnitCount(unitCount)

  const { data: existing } = await supabaseAdmin
    .from('landlord_subscriptions')
    .select('*')
    .eq('landlord_user_id', user.id)
    .maybeSingle()

  const hasActiveStripeSub = existing?.stripe_subscription_id && existing.status === 'active'

  if (hasActiveStripeSub && existing?.tier !== desiredTier) {
    const stripe = getStripe()
    const subscription = await stripe.subscriptions.retrieve(existing.stripe_subscription_id)
    const itemId = subscription.items.data[0]?.id

    if (desiredTier === 'free') {
      await stripe.subscriptions.cancel(existing.stripe_subscription_id)
      await supabaseAdmin
        .from('landlord_subscriptions')
        .update({ tier: 'free', stripe_subscription_id: null, status: 'active', updated_at: new Date().toISOString() })
        .eq('landlord_user_id', user.id)
    } else {
      const newPriceId = priceIdForTier(desiredTier)
      if (newPriceId && itemId) {
        await stripe.subscriptions.update(existing.stripe_subscription_id, {
          items: [{ id: itemId, price: newPriceId }],
          proration_behavior: 'create_prorations',
        })
      }
      await supabaseAdmin
        .from('landlord_subscriptions')
        .update({ tier: desiredTier, updated_at: new Date().toISOString() })
        .eq('landlord_user_id', user.id)
    }
  } else if (!existing) {
    await supabaseAdmin
      .from('landlord_subscriptions')
      .insert({ landlord_user_id: user.id, tier: desiredTier, status: 'active' })
  } else if (!hasActiveStripeSub && existing.tier !== desiredTier) {
    // No live Stripe subscription yet (never checked out, or previously free) —
    // just keep the local tier in sync so the billing UI shows the right prompt.
    await supabaseAdmin
      .from('landlord_subscriptions')
      .update({ tier: desiredTier, updated_at: new Date().toISOString() })
      .eq('landlord_user_id', user.id)
  }

  return NextResponse.json({ ok: true, unitCount, tier: desiredTier })
}
