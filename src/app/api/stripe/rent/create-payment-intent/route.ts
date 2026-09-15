import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'

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
    .select('id, expected_amount, actual_amount, tenancy_id, stripe_payment_intent_id, tenancies(renter_user_id, unit_id, units(property_id, properties(owner_user_id)))')
    .eq('id', rentPaymentId)
    .maybeSingle()

  if (rentPaymentError) {
    console.error('rent/create-payment-intent: error fetching rent payment', rentPaymentError)
    return NextResponse.json({ error: 'Could not load rent payment' }, { status: 500 })
  }

  const tenancy = rentPayment?.tenancies as any
  if (!rentPayment || !tenancy || tenancy.renter_user_id !== user.id) {
    return NextResponse.json({ error: 'Rent payment not found' }, { status: 404 })
  }

  const amountDue = Number(rentPayment.expected_amount) - Number(rentPayment.actual_amount || 0)
  if (amountDue <= 0) {
    return NextResponse.json({ error: 'This month is already paid.' }, { status: 400 })
  }

  const landlordUserId = tenancy.units?.properties?.owner_user_id
  if (!landlordUserId) {
    return NextResponse.json({ error: 'Could not determine landlord' }, { status: 500 })
  }

  const { data: landlordRow } = await supabaseAdmin
    .from('users')
    .select('stripe_connect_account_id, stripe_connect_status')
    .eq('id', landlordUserId)
    .maybeSingle()

  if (!landlordRow?.stripe_connect_account_id || landlordRow.stripe_connect_status !== 'active') {
    return NextResponse.json({ error: "Your landlord hasn't set up rent payouts yet." }, { status: 400 })
  }

  const stripe = getStripe()
  const amountCents = Math.round(amountDue * 100)

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    payment_method_types: ['card', 'us_bank_account'],
    transfer_data: { destination: landlordRow.stripe_connect_account_id },
    metadata: {
      prophandld_type: 'rent_payment',
      prophandld_rent_payment_id: rentPayment.id,
    },
  })

  await supabaseAdmin
    .from('rent_payments')
    .update({ stripe_payment_intent_id: paymentIntent.id, stripe_status: 'requires_payment' })
    .eq('id', rentPayment.id)

  return NextResponse.json({ clientSecret: paymentIntent.client_secret, amount: amountDue })
}
