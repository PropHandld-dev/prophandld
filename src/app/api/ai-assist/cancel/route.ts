import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'
import { friendlyStripeError } from '@/lib/stripeErrorMessage'
import { AI_ASSIST_ENABLED } from '@/lib/aiAssist'

export const maxDuration = 20

// Joshua's call: if a landlord has paid for the current period, cancelling
// should stop the NEXT charge, not cut off what they already paid for —
// so an active/past_due subscription gets cancel_at_period_end instead of
// an immediate stripe.subscriptions.cancel(), and access (hasAiAssistAccess
// still sees status: 'active') continues until Stripe's own
// customer.subscription.deleted fires at the real period end, which the
// webhook already turns into status: 'canceled'. Cancelling during the
// trial is the one case that still ends it immediately — nothing's been
// invoiced yet, so there's no paid period to honor.
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
    return NextResponse.json({ error: 'Only landlords can manage AI Assist' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  try {
    const { data: row, error: rowError } = await supabaseAdmin
      .from('ai_assist_subscriptions')
      .select('status, stripe_subscription_id')
      .eq('landlord_user_id', user.id)
      .maybeSingle()
    if (rowError) {
      console.error('ai-assist/cancel: error fetching row', rowError)
      return NextResponse.json({ error: 'Could not load AI Assist status' }, { status: 500 })
    }
    if (!row || row.status === 'canceled') {
      return NextResponse.json({ status: 'canceled' })
    }

    const stripe = getStripe()

    if (row.status !== 'trialing') {
      if (row.stripe_subscription_id) {
        const subscription = await stripe.subscriptions.update(row.stripe_subscription_id, { cancel_at_period_end: true })
        // Stripe moved the billing period off the subscription itself and
        // onto each item (a subscription can hold items with different
        // cycles) — this one always has exactly one item, so its period is
        // the subscription's.
        const periodEnd = subscription.items.data[0]?.current_period_end
        const { error: updateError } = await supabaseAdmin
          .from('ai_assist_subscriptions')
          .update({
            cancel_at_period_end: true,
            current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('landlord_user_id', user.id)
        if (updateError) {
          console.error('ai-assist/cancel: error updating row', updateError)
          return NextResponse.json({ error: 'Could not update AI Assist status' }, { status: 500 })
        }
      }
      return NextResponse.json({ status: row.status, cancelAtPeriodEnd: true })
    }

    if (row.stripe_subscription_id) {
      await stripe.subscriptions.cancel(row.stripe_subscription_id)
    }

    const { error: updateError } = await supabaseAdmin
      .from('ai_assist_subscriptions')
      .update({ status: 'canceled', cancel_at_period_end: false, current_period_end: null, updated_at: new Date().toISOString() })
      .eq('landlord_user_id', user.id)
    if (updateError) {
      console.error('ai-assist/cancel: error updating row', updateError)
      return NextResponse.json({ error: 'Could not update AI Assist status' }, { status: 500 })
    }

    return NextResponse.json({ status: 'canceled' })
  } catch (err) {
    console.error('ai-assist/cancel: unhandled error', err)
    return NextResponse.json({ error: friendlyStripeError(err, 'cancel AI Assist') }, { status: 500 })
  }
}

// Undo a scheduled cancellation while the current paid period hasn't
// ended yet — the landlord changed their mind before access would have
// actually stopped.
export async function DELETE() {
  if (!AI_ASSIST_ENABLED) {
    return NextResponse.json({ error: 'AI Assist is not available yet' }, { status: 404 })
  }

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords can manage AI Assist' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  try {
    const { data: row, error: rowError } = await supabaseAdmin
      .from('ai_assist_subscriptions')
      .select('status, stripe_subscription_id, cancel_at_period_end')
      .eq('landlord_user_id', user.id)
      .maybeSingle()
    if (rowError) {
      console.error('ai-assist/cancel DELETE: error fetching row', rowError)
      return NextResponse.json({ error: 'Could not load AI Assist status' }, { status: 500 })
    }
    if (!row || !row.cancel_at_period_end || !row.stripe_subscription_id) {
      return NextResponse.json({ error: 'Nothing to undo' }, { status: 400 })
    }

    const stripe = getStripe()
    await stripe.subscriptions.update(row.stripe_subscription_id, { cancel_at_period_end: false })

    const { error: updateError } = await supabaseAdmin
      .from('ai_assist_subscriptions')
      .update({ cancel_at_period_end: false, current_period_end: null, updated_at: new Date().toISOString() })
      .eq('landlord_user_id', user.id)
    if (updateError) {
      console.error('ai-assist/cancel DELETE: error updating row', updateError)
      return NextResponse.json({ error: 'Could not update AI Assist status' }, { status: 500 })
    }

    return NextResponse.json({ status: row.status, cancelAtPeriodEnd: false })
  } catch (err) {
    console.error('ai-assist/cancel DELETE: unhandled error', err)
    return NextResponse.json({ error: friendlyStripeError(err, 'undo the AI Assist cancellation') }, { status: 500 })
  }
}
