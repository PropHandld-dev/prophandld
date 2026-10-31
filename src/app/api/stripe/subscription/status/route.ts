import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { tierForUnitCount } from '@/lib/stripe'
import { TRIAL_DAYS } from '@/lib/pricingTiers'
import { sendReferralRewardEmail } from '@/lib/email'

// +30 days stacks on whatever the referrer's trial_override_days already
// is (their standard TRIAL_DAYS if they've never had one, or a previous
// referral reward / admin grant if they have) — same column /admin/users
// already uses for manual grants, so this is a real functional reward
// today even with billing enforcement off: it genuinely pushes out the
// day their trial clock would run out. Only covers a referrer still in
// trial; a referrer with a real active paid subscription would need an
// actual Stripe credit, a mechanism that doesn't exist yet and isn't
// urgent while billing enforcement itself is off (see
// billing_enforcement_timing project note) — that referral is silently
// left unrewarded by this automatic path rather than rewarded with
// something meaningless, same as today's status quo for that one case.
const REFERRAL_REWARD_DAYS = 30

async function rewardReferrerIfFirstTrial(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, referredUserId: string, referredName: string) {
  try {
    const { data: referral } = await supabaseAdmin
      .from('referrals')
      .select('id, referrer_user_id')
      .eq('referred_user_id', referredUserId)
      .is('rewarded_at', null)
      .maybeSingle()
    if (!referral) return

    const { data: referrerRow } = await supabaseAdmin
      .from('users')
      .select('trial_override_days, preferred_language')
      .eq('id', referral.referrer_user_id)
      .maybeSingle()
    const { data: referrerAuth } = await supabaseAdmin.auth.admin.getUserById(referral.referrer_user_id)
    if (!referrerAuth?.user?.email) return

    // Claim-once via the same is-null guard pattern as trial_started_at
    // itself, so two concurrent calls can't double-credit the same
    // referral — only the update that actually flips rewarded_at from
    // null proceeds to grant days and send the email.
    const { data: claimedReferral } = await supabaseAdmin
      .from('referrals')
      .update({ rewarded_at: new Date().toISOString() })
      .eq('id', referral.id)
      .is('rewarded_at', null)
      .select('id')
      .maybeSingle()
    if (!claimedReferral) return

    const newOverride = (referrerRow?.trial_override_days ?? TRIAL_DAYS) + REFERRAL_REWARD_DAYS
    await supabaseAdmin.from('users').update({ trial_override_days: newOverride }).eq('id', referral.referrer_user_id)

    await sendReferralRewardEmail({
      to: referrerAuth.user.email,
      landlordName: referrerAuth.user.user_metadata?.full_name || 'there',
      referredName,
      lang: referrerRow?.preferred_language === 'es' ? 'es' : 'en',
    })
  } catch (err) {
    console.error('subscription/status: referral reward failed', err)
  }
}

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
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
      .select('tier, stripe_subscription_id, status, cancel_at_period_end, current_period_end')
      .eq('landlord_user_id', user.id)
      .maybeSingle()

    if (subscriptionError) {
      console.error('subscription/status: error fetching subscription', subscriptionError)
      return NextResponse.json({ error: 'Could not load subscription', detail: subscriptionError.message }, { status: 500 })
    }

    const { data: userRow, error: userRowError } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id, trial_started_at, trial_override_days, free_forever')
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
      if (claimed?.trial_started_at) {
        await rewardReferrerIfFirstTrial(supabaseAdmin, user.id, user.user_metadata?.full_name || 'Someone')
      }
    }

    // Admin-granted override (see /admin/users "Trial & AI Assist" and
    // scripts/2026-10-29-trial-grants.sql) replaces the standard TRIAL_DAYS
    // for this one landlord — free_forever bypasses the trial clock
    // entirely rather than just extending it.
    const freeForever = !!userRow?.free_forever
    const trialMs = (userRow?.trial_override_days ?? TRIAL_DAYS) * 24 * 60 * 60 * 1000

    let daysLeftInTrial: number | null = null
    let trialExpired = false
    if (trialStartedAt && !hasActiveSubscription && !freeForever) {
      const elapsedMs = Date.now() - new Date(trialStartedAt).getTime()
      daysLeftInTrial = Math.max(0, Math.ceil((trialMs - elapsedMs) / (24 * 60 * 60 * 1000)))
      trialExpired = elapsedMs >= trialMs
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
      freeForever,
      cancelAtPeriodEnd: !!subscription?.cancel_at_period_end,
      currentPeriodEnd: subscription?.current_period_end ?? null,
    })
  } catch (err) {
    console.error('subscription/status: unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
