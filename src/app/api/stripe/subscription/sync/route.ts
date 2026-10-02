import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe, tierForUnitCount } from '@/lib/stripe'
import { friendlyStripeError } from '@/lib/stripeErrorMessage'

export const maxDuration = 20

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
    // Archived properties don't count — this used to be missed everywhere
    // in this file, so archiving a property never actually lowered what a
    // landlord was billed for.
    const { data: properties, error: propertiesError } = await supabaseAdmin
      .from('properties')
      .select('id')
      .eq('owner_user_id', user.id)
      .eq('archived', false)

    if (propertiesError) {
      console.error('subscription/sync: error fetching properties', propertiesError)
      return NextResponse.json({ error: 'Could not load properties', detail: propertiesError.message }, { status: 500 })
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
        return NextResponse.json({ error: 'Could not count units', detail: unitsError.message }, { status: 500 })
      }
      unitCount = count || 0
    }

    const desiredTier = tierForUnitCount(unitCount)

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('landlord_subscriptions')
      .select('*')
      .eq('landlord_user_id', user.id)
      .maybeSingle()

    if (existingError) {
      console.error('subscription/sync: error fetching existing subscription', existingError)
      return NextResponse.json({ error: 'Could not load subscription', detail: existingError.message }, { status: 500 })
    }

    const hasActiveStripeSub = existing?.stripe_subscription_id && existing.status === 'active'

    if (hasActiveStripeSub) {
      const stripe = getStripe()

      if (desiredTier === 'free') {
        // Portfolio shrank to the free tier (0 or 1 unit) — cancel rather
        // than leave an active $0 subscription behind. Checking the tier,
        // not unitCount === 0 directly, matters here: tierForUnitCount
        // treats exactly 1 unit as free too, and that case needs the same
        // clean cancellation, not a subscription synced to a $0 quantity.
        await stripe.subscriptions.cancel(existing.stripe_subscription_id)
        const { error } = await supabaseAdmin
          .from('landlord_subscriptions')
          .update({ tier: 'free', unit_count: 0, stripe_subscription_id: null, status: 'active', updated_at: new Date().toISOString() })
          .eq('landlord_user_id', user.id)
        if (error) {
          console.error('subscription/sync: error clearing subscription after cancel', error)
          return NextResponse.json({ error: 'Could not update subscription' }, { status: 500 })
        }
      } else {
        // Every paid tier is the same one graduated Price — the bill only
        // ever changes because `quantity` changes, never because the price
        // id does. This runs the same way whether the portfolio grew or
        // shrank, which is what actually fixes a portfolio that lost units
        // never lowering its bill: there's no separate "downgrade" branch
        // to have forgotten to wire up.
        const subscription = await stripe.subscriptions.retrieve(existing.stripe_subscription_id)
        const item = subscription.items.data[0]
        if (item && item.quantity !== unitCount) {
          await stripe.subscriptions.update(existing.stripe_subscription_id, {
            items: [{ id: item.id, quantity: unitCount }],
            proration_behavior: 'create_prorations',
          })
        }
        const { error } = await supabaseAdmin
          .from('landlord_subscriptions')
          .update({ tier: desiredTier, unit_count: unitCount, updated_at: new Date().toISOString() })
          .eq('landlord_user_id', user.id)
        if (error) {
          console.error('subscription/sync: error updating tier after Stripe quantity sync', error)
          return NextResponse.json({ error: 'Could not update subscription' }, { status: 500 })
        }
      }
    } else {
      // No live Stripe subscription to reconcile (never checked out, or
      // staying free) — just keep the local row in sync. Upsert unconditionally
      // rather than gating on "tier changed" so this never silently drifts.
      const { error } = await supabaseAdmin
        .from('landlord_subscriptions')
        .upsert(
          { landlord_user_id: user.id, tier: desiredTier, unit_count: unitCount, status: existing?.status || 'active', updated_at: new Date().toISOString() },
          { onConflict: 'landlord_user_id' }
        )
      if (error) {
        console.error('subscription/sync: error upserting local tier', error)
        return NextResponse.json({ error: 'Could not save unit count' }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, unitCount, tier: desiredTier })
  } catch (err) {
    console.error('subscription/sync: unhandled error', err)
    return NextResponse.json({ error: friendlyStripeError(err, 'update your subscription') }, { status: 500 })
  }
}
