import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'
import { getOrCreateStripeCustomer } from '@/lib/defaultPaymentMethod'
import { verifyPassword, mfaStepUpStatus } from '@/lib/reauth'

export const maxDuration = 20

// Saving a card/bank here is different from a one-off job/rent payment —
// it authorizes Prophandld to charge it again later with nobody present
// (see cron/unpaid-job-reminder's autocharge step), so it gets the same
// reauth bar as a payout-destination or P2P-handle change, not just a
// password typed into a form the client trusts blindly.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { password } = (await request.json().catch(() => ({}))) as { password?: string }

  const mfa = await mfaStepUpStatus(authClient)
  if (mfa.enrolled && !mfa.satisfied) {
    return NextResponse.json({ error: 'mfa_required' }, { status: 428 })
  }
  if (!mfa.satisfied) {
    if (!user.email || !(await verifyPassword(user.email, password || ''))) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
    }
  }

  const supabaseAdmin = getSupabaseAdmin()
  const customerId = await getOrCreateStripeCustomer(supabaseAdmin, user.id)

  const stripe = getStripe()
  // Card only for now, by design — the user explicitly asked for "a card
  // on file," and ACH's off-session reuse needs its own micro-deposit/
  // Financial Connections verification flow that's a separate piece of
  // work. Easy to add 'us_bank_account' here later without touching the
  // gate/autocharge logic, which only cares that a default method exists.
  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    usage: 'off_session',
    payment_method_types: ['card'],
    metadata: { prophandld_type: 'default_payment_method', prophandld_user_id: user.id },
  })

  return NextResponse.json({ clientSecret: setupIntent.client_secret })
}
