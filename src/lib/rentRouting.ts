import type { SupabaseClient } from '@supabase/supabase-js'

export type RentPayee = {
  side: 'owner' | 'pm'
  userId: string
  orgId: string | null
  orgName: string | null
  stripeAccountId: string | null
  stripeStatus: string | null
  payoutFrozenUntil: string | null
  achProvider: string | null
}

// Who receives this owner's rent right now. The PM only when all three
// hold: the owner approved it, the PM attested a broker license and a trust
// account, and the PM's payout account is set up. Anything else falls back
// to the owner, so rent never goes somewhere half-configured.
export async function resolveRentPayee(admin: SupabaseClient, ownerUserId: string): Promise<RentPayee> {
  const { data: portfolio } = await admin
    .from('pm_client_portfolios')
    .select('organization_id, rent_recipient, rent_to_pm_approved_at, pm_organizations(name, admin_user_id, trust_account_attested_at, broker_license_number)')
    .eq('owner_user_id', ownerUserId)
    .eq('status', 'accepted')
    .maybeSingle()
  const org = (portfolio as any)?.pm_organizations
  const pmEligible =
    portfolio?.rent_recipient === 'pm' &&
    !!portfolio?.rent_to_pm_approved_at &&
    !!org?.trust_account_attested_at &&
    !!org?.broker_license_number &&
    !!org?.admin_user_id

  const loadUser = async (id: string) =>
    (await admin.from('users').select('stripe_connect_account_id, stripe_connect_status, payout_frozen_until, ach_provider').eq('id', id).maybeSingle()).data

  if (pmEligible) {
    const pmRow = await loadUser(org.admin_user_id)
    if (pmRow?.stripe_connect_account_id && pmRow.stripe_connect_status === 'active') {
      return {
        side: 'pm',
        userId: org.admin_user_id,
        orgId: portfolio!.organization_id,
        orgName: org.name,
        stripeAccountId: pmRow.stripe_connect_account_id,
        stripeStatus: pmRow.stripe_connect_status,
        payoutFrozenUntil: pmRow.payout_frozen_until,
        achProvider: pmRow.ach_provider,
      }
    }
  }
  const ownerRow = await loadUser(ownerUserId)
  return {
    side: 'owner',
    userId: ownerUserId,
    orgId: null,
    orgName: null,
    stripeAccountId: ownerRow?.stripe_connect_account_id || null,
    stripeStatus: ownerRow?.stripe_connect_status || null,
    payoutFrozenUntil: ownerRow?.payout_frozen_until || null,
    achProvider: ownerRow?.ach_provider || null,
  }
}

// The Stripe account a given rent payment was actually charged on: the one
// recorded at charge time, or (for payments made before that was recorded)
// the owner's.
export async function rentPaymentStripeAccount(admin: SupabaseClient, recorded: string | null | undefined, ownerUserId: string | null | undefined): Promise<string | null> {
  if (recorded) return recorded
  if (!ownerUserId) return null
  const { data } = await admin.from('users').select('stripe_connect_account_id').eq('id', ownerUserId).maybeSingle()
  return data?.stripe_connect_account_id || null
}
