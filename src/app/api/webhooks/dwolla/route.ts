import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyDwollaWebhookSignature } from '@/lib/dwolla'
import { syncDwollaRentPayment } from '@/lib/rentPaymentSync'
import { sendRentPaymentReceivedEmail, sendBankTransferFailedEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'

export const maxDuration = 30

const TRANSFER_COMPLETED_TOPICS = ['customer_bank_transfer_completed', 'customer_transfer_completed']
const TRANSFER_FAILED_TOPICS = [
  'customer_bank_transfer_failed',
  'customer_transfer_failed',
  'customer_bank_transfer_cancelled',
  'customer_transfer_cancelled',
]
const FUNDING_SOURCE_VERIFIED_TOPIC = 'customer_funding_source_verified'
const FUNDING_SOURCE_REMOVED_TOPIC = 'customer_funding_source_removed'

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-request-signature-sha256')
  // Raw text, never JSON.parse()'d before verifying — Dwolla warns the body
  // must not be re-encoded, since any formatting difference (key order,
  // whitespace) breaks the HMAC comparison even for a genuine request.
  const rawBody = await request.text()

  if (!verifyDwollaWebhookSignature(rawBody, signature)) {
    console.error('dwolla webhook: signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const event = JSON.parse(rawBody) as { topic: string; resourceId: string; correlationId?: string }
  const supabaseAdmin = getSupabaseAdmin()

  try {
    if (TRANSFER_COMPLETED_TOPICS.includes(event.topic) || TRANSFER_FAILED_TOPICS.includes(event.topic)) {
      const { data: rentPayment } = await supabaseAdmin
        .from('rent_payments')
        .select('id')
        .eq('dwolla_transfer_id', event.resourceId)
        .maybeSingle()

      if (!rentPayment) {
        // Not a rent transfer this app created — nothing to do.
        return NextResponse.json({ ok: true })
      }

      const synced = await syncDwollaRentPayment(supabaseAdmin, rentPayment.id)

      // A bank transfer that failed or was cancelled (insufficient funds, a
      // closed account, etc) used to notify no one — the renter would only
      // find out by noticing rent was still unpaid later. 'failed' is the
      // fresh transition only (see syncDwollaRentPayment's race guard), so
      // this never double-sends on a redelivered webhook.
      if (synced === 'failed') {
        const { data: failedRentPayment } = await supabaseAdmin
          .from('rent_payments')
          .select('expected_amount, actual_amount, tenancies(renter_user_id, units(unit_number, properties(address)))')
          .eq('id', rentPayment.id)
          .maybeSingle()

        const renterUserId = (failedRentPayment?.tenancies as any)?.renter_user_id
        const failedUnit = (failedRentPayment?.tenancies as any)?.units
        const failedAmount = Number(failedRentPayment?.expected_amount || 0) - Number(failedRentPayment?.actual_amount || 0)

        if (renterUserId) {
          const { data: renter } = await supabaseAdmin
            .from('users')
            .select('email, full_name, preferred_language, email_notifications_enabled')
            .eq('id', renterUserId)
            .maybeSingle()
          const failedUnitLabel = failedUnit?.properties?.address
            ? `${failedUnit.properties.address}${failedUnit.unit_number ? `, Unit ${failedUnit.unit_number}` : ''}`
            : null
          if (renter?.email && emailAllowed(renter)) {
            await sendBankTransferFailedEmail({
              to: renter.email,
              renterName: renter.full_name || 'there',
              amount: failedAmount > 0 ? failedAmount : null,
              unitLabel: failedUnitLabel,
              lang: renter.preferred_language === 'es' ? 'es' : 'en',
            })
          }
          await sendPush(renterUserId, {
            title: "Bank transfer didn't go through",
            body: 'Rent is still due. Try again or use a debit card instead.',
            url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/renter/rent`,
          }).catch((err) => console.error('dwolla webhook: sendPush (transfer failed) failed', err))
        }

        return NextResponse.json({ ok: true })
      }

      // 'already_paid'/'already_failed' means an earlier call (a prior
      // delivery of this same event, a page poll, etc) already credited or
      // notified for this row — stop here so a redelivered webhook never
      // re-sends the "rent paid" or "bank transfer failed" notification.
      // Same guard as the Stripe rent branch.
      if (synced !== 'paid') {
        return NextResponse.json({ ok: true })
      }

      const { data: fullRentPayment } = await supabaseAdmin
        .from('rent_payments')
        .select('expected_amount, actual_amount, month, tenancies(unit_id, renter_user_id, units(unit_number, properties(address, owner_user_id)))')
        .eq('id', rentPayment.id)
        .maybeSingle()

      const unit = (fullRentPayment?.tenancies as any)?.units
      const landlordUserId = unit?.properties?.owner_user_id
      const amountPaid = Number(fullRentPayment?.actual_amount || 0)

      if (landlordUserId) {
        const monthLabel = fullRentPayment?.month
          ? new Date(fullRentPayment.month + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
          : 'this month'
        const unitLabel = unit?.properties?.address
          ? `${unit.properties.address}${unit.unit_number ? `, Unit ${unit.unit_number}` : ''}`
          : 'your unit'

        const { data: landlord } = await supabaseAdmin
          .from('users')
          .select('email, full_name, preferred_language, email_notifications_enabled')
          .eq('id', landlordUserId)
          .maybeSingle()
        if (landlord?.email && emailAllowed(landlord)) {
          await sendRentPaymentReceivedEmail({
            to: landlord.email,
            landlordName: landlord.full_name || 'there',
            amount: amountPaid,
            monthLabel,
            unitLabel,
            lang: landlord.preferred_language === 'es' ? 'es' : 'en',
          })
        }
        await sendPush(landlordUserId, {
          title: 'Rent payment received',
          body: `$${amountPaid.toFixed(2)} for ${unitLabel}`,
          url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord`,
        }).catch((err) => console.error('dwolla webhook: sendPush (rent) failed', err))

        const renterUserId = (fullRentPayment?.tenancies as any)?.renter_user_id
        if (renterUserId) {
          const { data: threadId, error: threadError } = await supabaseAdmin.rpc('start_landlord_tenant_thread', {
            p_landlord_user_id: landlordUserId,
            p_renter_user_id: renterUserId,
          })
          if (threadError) {
            console.error('dwolla webhook: start_landlord_tenant_thread failed', threadError)
          } else if (threadId) {
            const { error: messageError } = await supabaseAdmin.from('messages').insert({
              thread_id: threadId,
              sender_user_id: renterUserId,
              body: `✓ Rent paid: $${amountPaid.toFixed(2)} for ${monthLabel}`,
            })
            if (messageError) console.error('dwolla webhook: rent-paid message insert failed', messageError)
          }
        }
      }

      return NextResponse.json({ ok: true })
    }

    if (event.topic === FUNDING_SOURCE_VERIFIED_TOPIC) {
      await supabaseAdmin
        .from('users')
        .update({ dwolla_funding_source_status: 'verified', dwolla_customer_status: 'active' })
        .eq('dwolla_funding_source_id', event.resourceId)
      return NextResponse.json({ ok: true })
    }

    if (event.topic === FUNDING_SOURCE_REMOVED_TOPIC) {
      await supabaseAdmin
        .from('users')
        .update({ dwolla_funding_source_status: 'removed', dwolla_customer_status: 'pending' })
        .eq('dwolla_funding_source_id', event.resourceId)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('dwolla webhook: unhandled error', err)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
