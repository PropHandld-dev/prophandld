import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { tierForUnitCount } from '@/lib/stripe'
import { TRIAL_DAYS } from '@/lib/pricingTiers'

const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000

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
      .eq('archived', false)

    if (propertiesError) {
      console.error('subscription/status: error fetching properties', propertiesError)
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
        console.error('subscription/status: error counting units', unitsError)
        return NextResponse.json({ error: 'Could not count units', detail: unitsError.message }, { status: 500 })
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
      return NextResponse.json({ error: 'Could not load subscription', detail: subscriptionError.message }, { status: 500 })
    }

    const { data: userRow, error: userRowError } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id, trial_started_at')
      .eq('id', user.id)
      .maybeSingle()

    if (userRowError) {
      console.error('subscription/status: error fetching user row', userRowError)
      return NextResponse.json({ error: 'Could not load account', detail: userRowError.message }, { status: 500 })
    }

    const computedTier = tierForUnitCount(unitCount)
    const hasActiveSubscription = !!subscription?.stripe_subscription_id && subscription.status === 'active'

    // Claim-once, same pattern as welcomed_at in auth/welcome: only the
    // first call to ever see this landlord past the free tier sets it, and
    // it never resets even if they later archive units back under the
    // line — the trial is "since you first needed this", not a clock that
    // pauses and resumes.
    let trialStartedAt = userRow?.trial_started_at ?? null
    if (computedTier !== 'free' && !trialStartedAt) {
      const stampedAt = new Date().toISOString()
      const { data: claimed } = await supabaseAdmin
        .from('users')
        .update({ trial_started_at: stampedAt })
        .eq('id', user.id)
        .is('trial_started_at', null)
        .select('trial_started_at')
        .maybeSingle()
      trialStartedAt = claimed?.trial_started_at ?? trialStartedAt
    }

    let daysLeftInTrial: number | null = null
    let trialExpired = false
    if (trialStartedAt && !hasActiveSubscription) {
      const elapsedMs = Date.now() - new Date(trialStartedAt).getTime()
      daysLeftInTrial = Math.max(0, Math.ceil((TRIAL_MS - elapsedMs) / (24 * 60 * 60 * 1000)))
      trialExpired = elapsedMs >= TRIAL_MS
    }

    return NextResponse.json({
      unitCount,
      computedTier,
      tier: subscription?.tier || 'free',
      hasActiveSubscription,
      hasStripeCustomer: !!userRow?.stripe_customer_id,
      trialStartedAt,
      daysLeftInTrial,
      trialExpired,
    })
  } catch (err) {
    console.error('subscription/status: unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
