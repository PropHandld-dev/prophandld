import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { createTransfer, dwollaFundingSourceUrl } from '@/lib/dwolla'

export const maxDuration = 20

// Replaces the 'bank' branch of /api/stripe/rent/create-payment-intent.
// Debit-card rent stays entirely on that Stripe route, untouched — this
// one only ever runs for bank transfers. No surcharge: Prophandld absorbs
// its own Dwolla cost the same way it silently absorbed Stripe's ACH fee.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { rentPaymentId } = (await request.json()) as { rentPaymentId?: string }
  if (!rentPaymentId) {
    return NextResponse.json({ error: 'Missing rentPaymentId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: rentPayment, error: rentPaymentError } = await supabaseAdmin
    .from('rent_payments')
    .select('id, expected_amount, actual_amount, tenancy_id, dwolla_transfer_id, dwolla_status, tenancies(renter_user_id, unit_id, units(property_id, properties(owner_user_id)))')
    .eq('id', rentPaymentId)
    .maybeSingle()

  if (rentPaymentError) {
    console.error('dwolla/rent/create-transfer: error fetching rent payment', rentPaymentError)
    return NextResponse.json({ error: 'Could not load rent payment' }, { status: 500 })
  }

  const tenancy = rentPayment?.tenancies as any
  if (!rentPayment || !tenancy) {
    return NextResponse.json({ error: 'Rent payment not found' }, { status: 404 })
  }

  // Same shared-household authorization as the Stripe route: primary
  // tenant or any co-renter may pay.
  let mayPay = tenancy.renter_user_id === user.id
  if (!mayPay) {
    const { data: occupant } = await supabaseAdmin
      .from('tenancy_occupants')
      .select('id')
      .eq('tenancy_id', rentPayment.tenancy_id)
      .eq('renter_user_id', user.id)
      .maybeSingle()
    mayPay = !!occupant
  }
  if (!mayPay) {
    return NextResponse.json({ error: 'Rent payment not found' }, { status: 404 })
  }

  // A transfer already in flight for this row — don't create a second one.
  if (rentPayment.dwolla_transfer_id && rentPayment.dwolla_status === 'pending') {
    return NextResponse.json({ alreadyPending: true })
  }

  const amountDue = Number(rentPayment.expected_amount) - Number(rentPayment.actual_amount || 0)
  if (amountDue <= 0) {
    return NextResponse.json({ error: 'This month is already paid.' }, { status: 400 })
  }

  const landlordUserId = tenancy.units?.properties?.owner_user_id
  if (!landlordUserId) {
    return NextResponse.json({ error: 'Could not determine landlord' }, { status: 500 })
  }

  const [{ data: payerRow }, { data: landlordRow }] = await Promise.all([
    supabaseAdmin.from('users').select('dwolla_funding_source_id, dwolla_funding_source_status').eq('id', user.id).maybeSingle(),
    supabaseAdmin.from('users').select('dwolla_funding_source_id, dwolla_customer_status').eq('id', landlordUserId).maybeSingle(),
  ])

  if (!payerRow?.dwolla_funding_source_id || payerRow.dwolla_funding_source_status !== 'verified') {
    return NextResponse.json({ error: 'Link and verify a bank account first', needsLinking: true }, { status: 400 })
  }
  if (!landlordRow?.dwolla_funding_source_id || landlordRow.dwolla_customer_status !== 'active') {
    return NextResponse.json({ error: "Your landlord hasn't set up rent payouts yet." }, { status: 400 })
  }

  try {
    const transfer = await createTransfer({
      sourceFundingSourceUrl: dwollaFundingSourceUrl(payerRow.dwolla_funding_source_id),
      destinationFundingSourceUrl: dwollaFundingSourceUrl(landlordRow.dwolla_funding_source_id),
      amount: amountDue,
      correlationId: rentPayment.id,
    })

    const { error: updateError } = await supabaseAdmin
      .from('rent_payments')
      .update({ dwolla_transfer_id: transfer.id, dwolla_status: 'pending', payment_method: 'bank' })
      .eq('id', rentPayment.id)

    if (updateError) {
      console.error('dwolla/rent/create-transfer: error saving transfer id', updateError)
      return NextResponse.json({ error: 'Could not record the transfer' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, amount: amountDue })
  } catch (err: any) {
    console.error('dwolla/rent/create-transfer: dwolla call failed', err?.body || err)
    const dwollaMessage = err?.body?._embedded?.errors?.[0]?.message
    return NextResponse.json({ error: dwollaMessage || 'Could not start the bank transfer' }, { status: 500 })
  }
}
