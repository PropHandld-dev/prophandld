import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { syncDwollaRentPayment } from '@/lib/rentPaymentSync'
import { sendRentPaymentReceivedNotifications, sendRentBankTransferFailedNotifications } from '@/lib/rentPaymentNotify'
import { getTransfer, dwollaTransferUrl } from '@/lib/dwolla'

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

    // Same gap as the Stripe confirm route (see that file's comment): the
    // webhook used to be the only caller that ever notified, but the
    // renter's own browser calling this right after linking/transferring
    // usually wins the race to apply the payment. 'paid'/'failed' are both
    // fresh-transition-only (see syncDwollaRentPayment's status guard), so
    // this can't double-send.
    if (status === 'paid') {
      const { data: freshRent } = await admin
        .from('rent_payments')
        .select('dwolla_transfer_id')
        .eq('id', rent.id)
        .maybeSingle()
      // actual_amount on the row is a running total across every payment
      // this month (rent can be split across a partial card payment plus a
      // bank transfer, for example) — re-reading the transfer itself gives
      // the exact amount THIS payment added, not the month's cumulative
      // total. Same reasoning as the Stripe confirm route reading the
      // PaymentIntent directly instead of trusting the row.
      if (freshRent?.dwolla_transfer_id) {
        try {
          const transfer = await getTransfer(dwollaTransferUrl(freshRent.dwolla_transfer_id))
          await sendRentPaymentReceivedNotifications(admin, { rentPaymentId: rent.id, amount: Number(transfer.amount.value) })
        } catch (notifyErr) {
          console.error('dwolla/rent-payment/confirm: notification failed', notifyErr)
        }
      }
    } else if (status === 'failed') {
      await sendRentBankTransferFailedNotifications(admin, { rentPaymentId: rent.id }).catch((err) =>
        console.error('dwolla/rent-payment/confirm: notification failed', err)
      )
    }

    return NextResponse.json({ status })
  } catch (err) {
    console.error('dwolla/rent-payment/confirm: unhandled error', err)
    return NextResponse.json({ error: 'Could not check payment' }, { status: 500 })
  }
}
