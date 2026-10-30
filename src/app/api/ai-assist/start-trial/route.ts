import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe, aiAssistPriceId } from '@/lib/stripe'
import { friendlyStripeError } from '@/lib/stripeErrorMessage'
import { AI_ASSIST_ENABLED } from '@/lib/aiAssist'
import { AI_ASSIST_TRIAL_DAYS } from '@/lib/pricingTiers'

export const maxDuration = 20

// Always its own dedicated Stripe subscription (never a second item bolted
// onto the base plan's subscription) — keeps toggling AI Assist from ever
// touching the base plan's billing or webhook handling, and lets Stripe's
// native trial_period_days do the trial-to-charge transition for us
// instead of a custom conversion cron.
//
// Claim-once: a landlord who already has a row (any status, including
// canceled) gets that row's state back unchanged — starting a trial is a
// one-time thing, same philosophy as the base plan's trial_started_at.
export async function POST() {
  if (!AI_ASSIST_ENABLED) {
    return NextResponse.json({ error: 'AI Assist is not available yet' }, { status: 404 })
  }

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords can add AI Assist' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  try {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('ai_assist_subscriptions')
      .select('status')
      .eq('landlord_user_id', user.id)
      .maybeSingle()
    if (existingError) {
      console.error('ai-assist/start-trial: error checking existing row', existingError)
      return NextResponse.json({ error: 'Could not check AI Assist status' }, { status: 500 })
    }
    if (existing) {
      return NextResponse.json({ status: existing.status, alreadyStarted: true })
    }

    const priceId = aiAssistPriceId()
    if (!priceId) {
      console.error('ai-assist/start-trial: STRIPE_PRICE_AI_ASSIST is not configured')
      return NextResponse.json({ error: 'AI Assist billing is not set up yet.' }, { status: 503 })
    }

    const { data: properties } = await supabaseAdmin
      .from('properties')
      .select('id')
      .eq('owner_user_id', user.id)
      .eq('archived', false)
    const propertyIds = (properties || []).map((p) => p.id)
    let unitCount = 0
    if (propertyIds.length > 0) {
      const { count } = await supabaseAdmin
        .from('units')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propertyIds)
      unitCount = count || 0
    }
    // The real quantity still matters even on the free base tier — AI
    // Assist's own bracket pricing (pricingTiers.ts) starts at 1 unit, not
    // at whatever the base plan's free threshold is.
    const quantity = Math.max(1, unitCount)

    const { data: userRow, error: userRowError } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id, email, full_name')
      .eq('id', user.id)
      .maybeSingle()
    if (userRowError) {
      console.error('ai-assist/start-trial: error fetching user row', userRowError)
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
      await supabaseAdmin.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id)
    }

    const metadata = { prophandld_landlord_user_id: user.id, prophandld_type: 'ai_assist' }
    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'

    // A landlord who already has a card on file (any existing paid base
    // plan, or a prior Stripe Connect/rent setup) gets this the smooth way:
    // one tap, no redirect, subscription created straight away in trialing
    // status. Someone with no payment method yet (most likely a free-tier,
    // 1-unit landlord) can't skip that step — Stripe Checkout is where that
    // gets collected, same hosted flow the base plan and Connect onboarding
    // already use elsewhere in this app.
    const paymentMethods = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 })

    if (paymentMethods.data.length > 0) {
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId, quantity }],
        trial_period_days: AI_ASSIST_TRIAL_DAYS,
        metadata,
      })

      const { error: insertError } = await supabaseAdmin.from('ai_assist_subscriptions').insert({
        landlord_user_id: user.id,
        status: 'trialing',
        trial_started_at: new Date().toISOString(),
        stripe_subscription_id: subscription.id,
      })
      if (insertError) {
        console.error('ai-assist/start-trial: insert failed after creating subscription', insertError)
        return NextResponse.json({ error: 'Could not save AI Assist status' }, { status: 500 })
      }

      return NextResponse.json({ redirect: false, status: 'trialing' })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity }],
      success_url: `${origin}/profile?aiAssist=success`,
      cancel_url: `${origin}/profile?aiAssist=cancelled`,
      metadata,
      subscription_data: { trial_period_days: AI_ASSIST_TRIAL_DAYS, metadata },
    })

    return NextResponse.json({ redirect: true, url: session.url })
  } catch (err) {
    console.error('ai-assist/start-trial: unhandled error', err)
    return NextResponse.json({ error: friendlyStripeError(err, 'start your AI Assist trial') }, { status: 500 })
  }
}
