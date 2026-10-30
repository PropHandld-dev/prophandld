import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'
import { friendlyStripeError } from '@/lib/stripeErrorMessage'
import { AI_ASSIST_ENABLED } from '@/lib/aiAssist'

export const maxDuration = 20

// Cancelling during the trial costs nothing (Stripe never invoiced it) and
// cancelling once active stops the next invoice — either way this updates
// the DB immediately for instant UI feedback, and the webhook's
// customer.subscription.deleted case confirms the same thing shortly after,
// same "whichever call wins the race" idempotency already used for rent/job
// payment confirmations elsewhere in this app.
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

    if (row.stripe_subscription_id) {
      const stripe = getStripe()
      await stripe.subscriptions.cancel(row.stripe_subscription_id)
    }

    const { error: updateError } = await supabaseAdmin
      .from('ai_assist_subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
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
