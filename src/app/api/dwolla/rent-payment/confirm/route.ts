import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { syncDwollaRentPayment } from '@/lib/rentPaymentSync'

export const maxDuration = 15

// The Dwolla twin of /api/stripe/rent-payment/confirm. ACH transfers can
// take a few business days to clear and a webhook can arrive late, so the
// renter's and landlord's pages call this to catch up in the meantime.
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

  const admin = getSupabaseAdmin()

  const { data: rent, error } = await admin
    .from('rent_payments')
    .select('id, tenancy_id, tenancies(renter_user_id, units(properties(owner_user_id)))')
    .eq('id', rentPaymentId)
    .maybeSingle()

  if (error) {
    console.error('dwolla/rent-payment/confirm: error fetching rent payment', error)
    return NextResponse.json({ error: 'Could not load rent payment' }, { status: 500 })
  }

  const tenancy = rent?.tenancies as any
  const landlordId = tenancy?.units?.properties?.owner_user_id
  let allowed = !!rent && (tenancy?.renter_user_id === user.id || landlordId === user.id)
  if (rent && !allowed) {
    const { data: occupant } = await admin
      .from('tenancy_occupants')
      .select('id')
      .eq('tenancy_id', rent.tenancy_id)
      .eq('renter_user_id', user.id)
      .maybeSingle()
    allowed = !!occupant
  }
  if (!rent || !allowed) {
    return NextResponse.json({ error: 'Rent payment not found' }, { status: 404 })
  }

  try {
    const status = await syncDwollaRentPayment(admin, rent.id)
    return NextResponse.json({ status })
  } catch (err) {
    console.error('dwolla/rent-payment/confirm: unhandled error', err)
    return NextResponse.json({ error: 'Could not check payment' }, { status: 500 })
  }
}
