import type { SupabaseClient } from '@supabase/supabase-js'
import { getStripe, tierForUnitCount } from '@/lib/stripe'

export type SubscriptionSyncResult =
  | { ok: true; unitCount: number; tier: string }
  | { ok: false; error: string }

// Brings one landlord's platform subscription in line with their current
// unit count. Shared by /api/stripe/subscription/sync (a landlord syncing
// themselves) and by PM routes that change a CLIENT's unit count on their
// behalf -- the bill belongs to the owner, so it must resync for the
// owner, not for the PM who clicked the button.
export async function syncLandlordSubscription(admin: SupabaseClient, landlordUserId: string): Promise<SubscriptionSyncResult> {
  // Archived properties don't count -- this used to be missed, so archiving
  // a property never actually lowered what a landlord was billed for.
  const { data: properties, error: propertiesError } = await admin
    .from('properties')
    .select('id')
    .eq('owner_user_id', landlordUserId)
    .eq('archived', false)
  if (propertiesError) {
    console.error('subscriptionSync: error fetching properties', propertiesError)
    return { ok: false, error: 'Could not load properties' }
  }

  const propertyIds = (properties || []).map((p: any) => p.id)
  let unitCount = 0
  if (propertyIds.length > 0) {
    const { count, error: unitsError } = await admin
      .from('units')
      .select('id', { count: 'exact', head: true })
      .in('property_id', propertyIds)
    if (unitsError) {
      console.error('subscriptionSync: error counting units', unitsError)
      return { ok: false, error: 'Could not count units' }
    }
    unitCount = count || 0
  }

  const desiredTier = tierForUnitCount(unitCount)

  const { data: existing, error: existingError } = await admin
    .from('landlord_subscriptions')
    .select('*')
    .eq('landlord_user_id', landlordUserId)
    .maybeSingle()
  if (existingError) {
    console.error('subscriptionSync: error fetching existing subscription', existingError)
    return { ok: false, error: 'Could not load subscription' }
  }

  const hasActiveStripeSub = existing?.stripe_subscription_id && existing.status === 'active'

  if (hasActiveStripeSub) {
    const stripe = getStripe()
    if (desiredTier === 'free') {
      // Shrank to the free tier (0 or 1 unit) -- cancel rather than leave an
      // active $0 subscription behind. tierForUnitCount treats exactly 1
      // unit as free too, so this checks the tier, not unitCount === 0.
      await stripe.subscriptions.cancel(existing.stripe_subscription_id)
      const { error } = await admin
        .from('landlord_subscriptions')
        .update({ tier: 'free', unit_count: 0, stripe_subscription_id: null, status: 'active', updated_at: new Date().toISOString() })
        .eq('landlord_user_id', landlordUserId)
      if (error) {
        console.error('subscriptionSync: error clearing subscription after cancel', error)
        return { ok: false, error: 'Could not update subscription' }
      }
    } else {
      // Every paid tier is one graduated Price; only `quantity` changes, so
      // growing and shrinking go through the same path.
      const subscription = await stripe.subscriptions.retrieve(existing.stripe_subscription_id)
      const item = subscription.items.data[0]
      if (item && item.quantity !== unitCount) {
        await stripe.subscriptions.update(existing.stripe_subscription_id, {
          items: [{ id: item.id, quantity: unitCount }],
          proration_behavior: 'create_prorations',
        })
      }
      const { error } = await admin
        .from('landlord_subscriptions')
        .update({ tier: desiredTier, unit_count: unitCount, updated_at: new Date().toISOString() })
        .eq('landlord_user_id', landlordUserId)
      if (error) {
        console.error('subscriptionSync: error updating tier after Stripe quantity sync', error)
        return { ok: false, error: 'Could not update subscription' }
      }
    }
  } else {
    // No live Stripe subscription -- keep the local row in sync. Upsert
    // unconditionally so it never silently drifts.
    const { error } = await admin
      .from('landlord_subscriptions')
      .upsert(
        { landlord_user_id: landlordUserId, tier: desiredTier, unit_count: unitCount, status: existing?.status || 'active', updated_at: new Date().toISOString() },
        { onConflict: 'landlord_user_id' }
      )
    if (error) {
      console.error('subscriptionSync: error upserting local tier', error)
      return { ok: false, error: 'Could not save unit count' }
    }
  }

  return { ok: true, unitCount, tier: desiredTier }
}
