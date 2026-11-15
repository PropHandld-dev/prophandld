import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'
import { computeManagementFeeAmount } from '@/lib/pmFee'
import { sendPmFeeChargedEmail, sendPmFeeAutochargeFailedEmail } from '@/lib/email'

export const maxDuration = 60

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Runs daily (see vercel.json). Before this, "monthly" management fee was
// just a label on the portfolio row — nothing ever actually charged it,
// the owner had to remember to click "Pay now" in /landlord/pm every
// cycle, with no reminder if they forgot. Mirrors cron/unpaid-job-reminder's
// own autocharge block almost exactly (off_session charge against the
// owner's saved default_payment_method_id, claim-then-attempt for
// idempotency, email on success and on failure) — landlord-pays-PM instead
// of landlord-pays-contractor, same direct-charge-to-the-recipient's-own-
// Stripe-account shape either way. Billed at most once per calendar month
// per portfolio, tracked via last_fee_billed_month rather than a fixed
// day, so a portfolio set up mid-month still gets billed this run instead
// of waiting until the 1st.
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const monthKey = currentMonthKey()

  const { data: portfolios, error } = await supabaseAdmin
    .from('pm_client_portfolios')
    .select('id, owner_user_id, management_fee, management_fee_type, management_fee_percent, management_fee_frequency, last_fee_billed_month, organization_id, pm_organizations(admin_user_id, name)')
    .eq('status', 'accepted')
    .eq('management_fee_frequency', 'monthly')
    .or(`last_fee_billed_month.is.null,last_fee_billed_month.neq.${monthKey}`)

  if (error) {
    console.error('cron/pm-fee-billing: error fetching portfolios', error)
    return NextResponse.json({ error: 'Could not fetch portfolios' }, { status: 500 })
  }
  if (!portfolios || portfolios.length === 0) {
    return NextResponse.json({ ok: true, billed: 0, skipped: 0, checked: 0 })
  }

  const ownerIds = Array.from(new Set(portfolios.map((p: any) => p.owner_user_id).filter(Boolean)))
  const { data: owners } = await supabaseAdmin
    .from('users')
    .select('id, email, full_name, preferred_language, email_notifications_enabled, default_payment_method_id, default_payment_method_type, stripe_customer_id')
    .in('id', ownerIds)
  const ownerById = new Map((owners || []).map((u: any) => [u.id, u]))

  const pmAdminIds = Array.from(new Set(portfolios.map((p: any) => (p.pm_organizations as any)?.admin_user_id).filter(Boolean)))
  const { data: pmAdmins } = await supabaseAdmin
    .from('users')
    .select('id, stripe_connect_account_id, stripe_connect_status, payout_frozen_until')
    .in('id', pmAdminIds)
  const pmAdminById = new Map((pmAdmins || []).map((u: any) => [u.id, u]))

  const stripe = getStripe()
  let billed = 0
  let skipped = 0

  for (const portfolio of portfolios as any[]) {
    // Claimed first — one attempt per portfolio per calendar month. If two
    // overlapping runs raced on this row, only one would see its own
    // update take effect here.
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('pm_client_portfolios')
      .update({ last_fee_billed_month: monthKey })
      .eq('id', portfolio.id)
      .or(`last_fee_billed_month.is.null,last_fee_billed_month.neq.${monthKey}`)
      .select('id')

    if (claimError) {
      console.error('cron/pm-fee-billing: could not claim portfolio', { portfolioId: portfolio.id, claimError })
      continue
    }
    if (!claimed || claimed.length === 0) continue

    const owner = portfolio.owner_user_id ? ownerById.get(portfolio.owner_user_id) : null
    const orgName = (portfolio.pm_organizations as any)?.name || 'your property manager'
    const pmAdminId = (portfolio.pm_organizations as any)?.admin_user_id
    const pmAdmin = pmAdminId ? pmAdminById.get(pmAdminId) : null
    const lang: 'en' | 'es' = owner?.preferred_language === 'es' ? 'es' : 'en'

    const amount = await computeManagementFeeAmount(supabaseAdmin, portfolio)
    if (amount <= 0) {
      // Percent-of-rent with nothing collected last month, or a flat fee
      // that got cleared between when this list was fetched and now —
      // either way, nothing to charge, billed for this month regardless so
      // it isn't re-checked every run until next month.
      skipped++
      continue
    }

    if (!owner?.default_payment_method_id || owner.default_payment_method_type !== 'card') {
      skipped++
      continue
    }
    if (!pmAdmin?.stripe_connect_account_id || pmAdmin.stripe_connect_status !== 'active') {
      skipped++
      continue
    }
    if (pmAdmin.payout_frozen_until && new Date(pmAdmin.payout_frozen_until) > new Date()) {
      skipped++
      continue
    }

    try {
      const amountCents = Math.round(amount * 100)
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: 'usd',
          customer: owner.stripe_customer_id || undefined,
          payment_method: owner.default_payment_method_id,
          off_session: true,
          confirm: true,
          payment_method_types: ['card'],
          metadata: {
            prophandld_type: 'pm_management_fee_autocharge',
            prophandld_portfolio_id: portfolio.id,
            prophandld_base_amount: amount.toFixed(2),
          },
        },
        { stripeAccount: pmAdmin.stripe_connect_account_id }
      )

      if (paymentIntent.status === 'succeeded') {
        await supabaseAdmin.from('pm_fee_payments').insert({
          portfolio_id: portfolio.id,
          amount,
          status: 'paid',
          stripe_payment_intent_id: paymentIntent.id,
          paid_at: new Date().toISOString(),
        })
        billed++
        if (owner.email && owner.email_notifications_enabled !== false) {
          await sendPmFeeChargedEmail({
            to: owner.email,
            landlordName: owner.full_name || 'there',
            orgName,
            amount,
            lang,
          }).catch((err) => console.error('cron/pm-fee-billing: charged email failed', { portfolioId: portfolio.id, err }))
        }
      } else {
        await supabaseAdmin.from('pm_fee_payments').insert({
          portfolio_id: portfolio.id,
          amount,
          status: 'failed',
          stripe_payment_intent_id: paymentIntent.id,
        })
        skipped++
        if (owner.email && owner.email_notifications_enabled !== false) {
          await sendPmFeeAutochargeFailedEmail({
            to: owner.email,
            landlordName: owner.full_name || 'there',
            orgName,
            amount,
            reason: 'your bank needs you to confirm this payment directly',
            lang,
          }).catch((err) => console.error('cron/pm-fee-billing: failed email failed', { portfolioId: portfolio.id, err }))
        }
      }
    } catch (err: any) {
      await supabaseAdmin.from('pm_fee_payments').insert({
        portfolio_id: portfolio.id,
        amount,
        status: 'failed',
      })
      skipped++
      if (owner?.email && owner.email_notifications_enabled !== false) {
        await sendPmFeeAutochargeFailedEmail({
          to: owner.email,
          landlordName: owner.full_name || 'there',
          orgName,
          amount,
          reason: err?.message || 'your card was declined',
          lang,
        }).catch((e) => console.error('cron/pm-fee-billing: failed email failed', { portfolioId: portfolio.id, e }))
      }
      console.error('cron/pm-fee-billing: autocharge attempt failed', { portfolioId: portfolio.id, err })
    }
  }

  return NextResponse.json({ ok: true, billed, skipped, checked: portfolios.length })
}
