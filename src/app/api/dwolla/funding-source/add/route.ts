import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { addFundingSourceByAccountNumber, dwollaCustomerUrl, initiateMicroDeposits } from '@/lib/dwolla'
import { sendPayoutDetailsChangedEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'

export const maxDuration = 20

// Manual routing/account entry — works today without waiting on Dwolla to
// enable instant verification (Exchange Sessions) on this account. A
// funding source created this way can RECEIVE transfers immediately even
// while unverified, so this is the right path for landlords regardless of
// how the renter-side bank-linking decision resolves (see dwolla.ts).
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { routingNumber, accountNumber, bankAccountType, name } = (await request.json()) as {
    routingNumber?: string
    accountNumber?: string
    bankAccountType?: 'checking' | 'savings'
    name?: string
  }
  if (!routingNumber?.trim() || !accountNumber?.trim() || !bankAccountType) {
    return NextResponse.json({ error: 'Missing routing number, account number, or account type' }, { status: 400 })
  }

  const role = user.app_metadata?.role

  const supabaseAdmin = getSupabaseAdmin()
  const { data: userRow, error: userRowError } = await supabaseAdmin
    .from('users')
    .select('dwolla_customer_id, dwolla_funding_source_id, dwolla_customer_status, email, full_name, preferred_language')
    .eq('id', user.id)
    .maybeSingle()

  if (userRowError || !userRow?.dwolla_customer_id) {
    return NextResponse.json({ error: 'Set up your Dwolla account first' }, { status: 400 })
  }

  // Unlike Stripe Connect (hosted on Stripe's own domain, where a bank-detail
  // change fires account.updated and this app only ever hears about it after
  // the fact), this form IS the payout-account-change surface — nothing here
  // required re-proving identity or even noticed when an already-active
  // landlord's payout destination silently changed. Same real risk as the
  // Stripe case this freeze-and-alert pattern already protects: anyone with
  // a logged-in session (stolen password, unattended device) could redirect
  // every future rent payout to a new account with zero friction and zero
  // signal to the real owner. A brand-new setup (no prior funding source)
  // isn't this risk — there's nothing to hijack yet — so only a change to an
  // already-active payout account triggers the freeze.
  const isChangeToActiveAccount = !!userRow.dwolla_funding_source_id && userRow.dwolla_customer_status === 'active'

  try {
    const fundingSource = await addFundingSourceByAccountNumber({
      customerUrl: dwollaCustomerUrl(userRow.dwolla_customer_id),
      routingNumber: routingNumber.trim(),
      accountNumber: accountNumber.trim(),
      bankAccountType,
      name: name?.trim() || 'Bank account',
    })

    // A funding source can RECEIVE transfers immediately even while
    // unverified — only SENDING requires the micro-deposit round trip.
    // Landlords only ever receive rent here (Prophandld's facilitator
    // account creates the transfer; the landlord's funding source is just
    // the destination), so they skip straight to active regardless of
    // their Dwolla Customer type. Renters send, so they always need it.
    const onlyReceives = role === 'landlord'
    if (!onlyReceives) {
      await initiateMicroDeposits(fundingSource.url)
    }

    // Only a landlord's funding source is a payout destination (what this
    // freeze protects) — a renter's is where rent gets pulled FROM, so
    // swapping it can't redirect money to an attacker the same way.
    const freezeThisChange = onlyReceives && isChangeToActiveAccount
    const updates: Record<string, unknown> = {
      dwolla_funding_source_id: fundingSource.id,
      dwolla_funding_source_status: onlyReceives ? 'verified' : 'pending',
      dwolla_customer_status: onlyReceives ? 'active' : 'pending',
    }
    if (freezeThisChange) {
      updates.payout_frozen_until = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', user.id)

    if (updateError) {
      console.error('dwolla/funding-source/add: error saving funding source', updateError)
      return NextResponse.json({ error: 'Could not save bank account' }, { status: 500 })
    }

    if (freezeThisChange && userRow.email) {
      sendPayoutDetailsChangedEmail({
        to: userRow.email,
        name: userRow.full_name || 'there',
        lang: userRow.preferred_language === 'es' ? 'es' : 'en',
      }).catch((err) => console.error('dwolla/funding-source/add: payout-changed alert email failed', err))
      sendPush(user.id, {
        title: 'Payout bank account changed',
        body: "If this wasn't you, contact us immediately.",
        url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/profile`,
      }).catch((err) => console.error('dwolla/funding-source/add: payout-changed alert push failed', err))
    }

    return NextResponse.json({ ok: true, needsMicroDepositVerification: !onlyReceives })
  } catch (err: any) {
    console.error('dwolla/funding-source/add: dwolla call failed', err?.body || err)
    const dwollaMessage = err?.body?._embedded?.errors?.[0]?.message
    return NextResponse.json({ error: dwollaMessage || 'Could not add bank account' }, { status: 400 })
  }
}
