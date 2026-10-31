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
// Claim-once protects the free TRIAL specifically (a landlord who already
// has a row in any non-canceled status gets that row's state back
// unchanged, same philosophy as the base plan's trial_started_at) — it
// does not mean "can never pay for this again." A landlord whose row is
// 'canceled' can always restart, just without a second trial period,
// since they already used theirs. Found live: Joshua clicked cancel and
// then couldn't restart at all — this used to treat any existing row,
// canceled or not, as claimed forever.
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
    const isRestart = !!existing && existing.status === 'canceled'
    if (existing && !isRestart) {
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
      // Claim the row before touching Stripe, not after — a double-click or
      // a client retry otherwise lets two concurrent requests both pass the
      // `!existing` check above and both call subscriptions.create(). For a
      // brand-new row, the primary key does that (the second insert fails);
      // for a restart, there's no insert conflict to lean on since the row
      // already exists, so the claim is a conditional update that only
      // succeeds while the row is still exactly 'canceled' — the loser sees
      // 0 rows affected and bails out here instead, before any Stripe call,
      // same race this whole claim-first pattern exists to close either way.
      let claimed = true
      if (isRestart) {
        const { data: rows, error: claimError } = await supabaseAdmin
          .from('ai_assist_subscriptions')
          .update({ status: 'trialing', stripe_subscription_id: null, cancel_at_period_end: false, current_period_end: null })
          .eq('landlord_user_id', user.id)
          .eq('status', 'canceled')
          .select('landlord_user_id')
        claimed = !claimError && !!rows?.length
      } else {
        const { error: claimError } = await supabaseAdmin.from('ai_assist_subscriptions').insert({
          landlord_user_id: user.id,
          status: 'trialing',
          trial_started_at: new Date().toISOString(),
          stripe_subscription_id: null,
        })
        claimed = !claimError
      }
      if (!claimed) {
        const { data: raceWinner } = await supabaseAdmin
          .from('ai_assist_subscriptions')
          .select('status')
          .eq('landlord_user_id', user.id)
          .maybeSingle()
        return NextResponse.json({ status: raceWinner?.status || 'trialing', alreadyStarted: true })
      }

      // If anything from here fails, the claimed row must not survive as a
      // bare "trialing, no subscription" — that would hand out free AI
      // Assist access with no real Stripe subscription behind it at all.
      try {
        const subscription = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: priceId, quantity }],
          // A restart already used its one free trial — charge now instead
          // of granting a second one.
          ...(isRestart ? {} : { trial_period_days: AI_ASSIST_TRIAL_DAYS }),
          metadata,
        })

        const { error: updateError } = await supabaseAdmin
          .from('ai_assist_subscriptions')
          .update({ stripe_subscription_id: subscription.id, status: subscription.status === 'active' ? 'active' : 'trialing' })
          .eq('landlord_user_id', user.id)
        if (updateError) {
          // The Stripe subscription is real at this point — cancel it rather
          // than reverting the row and leaving it live with nothing tracking
          // it, same failure mode this whole claim-row change exists to
          // close.
          console.error('ai-assist/start-trial: update failed after creating subscription, cancelling it', updateError)
          await stripe.subscriptions.cancel(subscription.id).catch((cancelErr) => console.error('ai-assist/start-trial: cleanup cancel also failed', cancelErr))
          if (isRestart) {
            await supabaseAdmin.from('ai_assist_subscriptions').update({ status: 'canceled', stripe_subscription_id: null }).eq('landlord_user_id', user.id)
          } else {
            await supabaseAdmin.from('ai_assist_subscriptions').delete().eq('landlord_user_id', user.id).is('stripe_subscription_id', null)
          }
          return NextResponse.json({ error: 'Could not save AI Assist status' }, { status: 500 })
        }

        return NextResponse.json({ redirect: false, status: subscription.status === 'active' ? 'active' : 'trialing' })
      } catch (err) {
        if (isRestart) {
          await supabaseAdmin.from('ai_assist_subscriptions').update({ status: 'canceled', stripe_subscription_id: null }).eq('landlord_user_id', user.id)
        } else {
          await supabaseAdmin.from('ai_assist_subscriptions').delete().eq('landlord_user_id', user.id).is('stripe_subscription_id', null)
        }
        throw err
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity }],
      success_url: `${origin}/profile?aiAssist=success`,
      cancel_url: `${origin}/profile?aiAssist=cancelled`,
      metadata,
      subscription_data: isRestart ? { metadata } : { trial_period_days: AI_ASSIST_TRIAL_DAYS, metadata },
    })

    return NextResponse.json({ redirect: true, url: session.url })
  } catch (err) {
    console.error('ai-assist/start-trial: unhandled error', err)
    return NextResponse.json({ error: friendlyStripeError(err, 'start your AI Assist trial'), _debug: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
