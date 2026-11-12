import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { createDwollaCustomer } from '@/lib/payments/dwollaProvider'

export const maxDuration = 20

// Deliberately separate from /api/stripe/connect/onboard -- that route is
// Stripe-only by design (see its own comment): the Stripe Connect account
// still handles job payouts and card rent regardless of a landlord's ACH
// provider. A landlord on Dwolla ACH needs a second, independent payout
// destination -- Dwolla can only deposit into a Dwolla funding source, not
// into a Stripe balance -- so this creates that landlord's receive-only
// Dwolla Customer on first use, idempotently.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords can set up Dwolla payouts' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: row } = await supabaseAdmin
    .from('users')
    .select('dwolla_customer_id, email, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (row?.dwolla_customer_id) {
    return NextResponse.json({ dwollaCustomerId: row.dwolla_customer_id })
  }

  try {
    const [firstName, ...rest] = (row?.full_name || 'Landlord').split(' ')
    const dwollaCustomerId = await createDwollaCustomer({
      firstName,
      lastName: rest.join(' ') || 'User',
      email: row?.email || user.email || `${user.id}@prophandld.com`,
      type: 'receive-only',
    })

    await supabaseAdmin
      .from('users')
      .update({ dwolla_customer_id: dwollaCustomerId, dwolla_customer_status: 'active' })
      .eq('id', user.id)

    return NextResponse.json({ dwollaCustomerId })
  } catch (err) {
    console.error('payments/dwolla/customer: error creating customer', err)
    return NextResponse.json({ error: 'Could not set up your payout account' }, { status: 500 })
  }
}
