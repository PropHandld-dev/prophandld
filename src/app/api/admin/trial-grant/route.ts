import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { logAdminAudit } from '@/lib/auditLog'
import { getStripe } from '@/lib/stripe'
import { sendTrialGrantedEmail } from '@/lib/email'

type Product = 'base' | 'ai_assist'
type Mode = 'days' | 'free' | 'reset'

// Staff-only override of the standard 14-day trial, per landlord, per
// product — "give this person X days to try it" or "just make it free for
// them", without touching anything about how trials work for everyone
// else. See scripts/2026-10-29-trial-grants.sql for the columns this
// writes, and subscription/status + ai-assist/status for how they're read.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { landlordUserId, product, mode, days } = (await request.json()) as {
    landlordUserId?: string
    product?: Product
    mode?: Mode
    days?: number
  }

  if (!landlordUserId || (product !== 'base' && product !== 'ai_assist') || (mode !== 'days' && mode !== 'free' && mode !== 'reset')) {
    return NextResponse.json({ error: 'Missing or invalid landlordUserId, product, or mode' }, { status: 400 })
  }
  if (mode === 'days' && (!days || days < 1 || days > 3650)) {
    return NextResponse.json({ error: 'days must be between 1 and 3650' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(landlordUserId)
  if (!authUser?.user || authUser.user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
  }

  try {
    const now = new Date().toISOString()

    if (product === 'base') {
      // Deliberately DB-only, unlike the ai_assist branch below — this is
      // the live, already-launched base plan, so a landlord who already
      // has a real active Stripe subscription keeps it running in parallel
      // if granted "free forever" here. Silently cancelling someone's real
      // recurring revenue as a side effect of an admin trial-grant action
      // is a bigger, harder-to-reverse call than this tool should make on
      // its own — if that case ever comes up, cancel the real subscription
      // separately and deliberately, via the Stripe Dashboard.
      const updates =
        mode === 'days'
          ? { trial_override_days: days, free_forever: false, trial_started_at: now }
          : mode === 'free'
            ? { free_forever: true }
            : { trial_override_days: null, free_forever: false }
      const { error } = await supabaseAdmin.from('users').update(updates).eq('id', landlordUserId)
      if (error) {
        console.error('admin/trial-grant: base update failed', error)
        return NextResponse.json({ error: 'Could not update trial' }, { status: 500 })
      }
    } else {
      // 'free' and 'reset' both end any real billing relationship — a
      // landlord who already had a genuinely active/trialing paid Stripe
      // subscription needs that actually cancelled, not just the DB status
      // overwritten underneath it, or Stripe keeps charging them while our
      // own records say otherwise.
      if (mode === 'free' || mode === 'reset') {
        const { data: existing } = await supabaseAdmin
          .from('ai_assist_subscriptions')
          .select('stripe_subscription_id, status')
          .eq('landlord_user_id', landlordUserId)
          .maybeSingle()
        if (existing?.stripe_subscription_id && existing.status !== 'canceled') {
          try {
            await getStripe().subscriptions.cancel(existing.stripe_subscription_id)
          } catch (stripeErr) {
            console.error('admin/trial-grant: failed to cancel existing ai_assist subscription', stripeErr)
          }
        }
      }

      const updates =
        mode === 'days'
          ? { trial_override_days: days, free_forever: false, status: 'trialing', trial_started_at: now, updated_at: now }
          : mode === 'free'
            ? { free_forever: true, status: 'active', stripe_subscription_id: null, updated_at: now }
            : { trial_override_days: null, free_forever: false, status: 'canceled', stripe_subscription_id: null, updated_at: now }
      const { error } = await supabaseAdmin
        .from('ai_assist_subscriptions')
        .upsert({ landlord_user_id: landlordUserId, ...updates }, { onConflict: 'landlord_user_id' })
      if (error) {
        console.error('admin/trial-grant: ai_assist update failed', error)
        return NextResponse.json({ error: 'Could not update AI Assist trial' }, { status: 500 })
      }
    }

    await logAdminAudit({
      actionType: 'trial_granted',
      actorUserId: user.id,
      actorEmail: user.email,
      targetUserId: landlordUserId,
      targetEmail: authUser.user.email || null,
      targetRole: 'landlord',
      detail: { product, mode, days: mode === 'days' ? days : undefined },
    })

    // Best-effort in the sense that a failed send doesn't undo the grant
    // (already logged above) — but still awaited, not fire-and-forget,
    // since an un-awaited send here routinely never actually completed
    // before this route's response went out and tore the function down.
    if (authUser.user.email) {
      const { data: profile } = await supabaseAdmin
        .from('users')
        .select('full_name, preferred_language')
        .eq('id', landlordUserId)
        .maybeSingle()
      await sendTrialGrantedEmail({
        to: authUser.user.email,
        landlordName: profile?.full_name || 'there',
        product,
        mode,
        days: mode === 'days' ? days : undefined,
        lang: profile?.preferred_language === 'es' ? 'es' : 'en',
      }).catch((err) => console.error('admin/trial-grant: notification email failed', err))
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('admin/trial-grant: unhandled error', err)
    return NextResponse.json({ error: 'Could not update trial' }, { status: 500 })
  }
}
