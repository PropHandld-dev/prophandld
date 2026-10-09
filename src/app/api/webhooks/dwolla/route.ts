import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyDwollaWebhookSignature, getTransfer, dwollaTransferUrl } from '@/lib/dwolla'
import { syncDwollaRentPayment } from '@/lib/rentPaymentSync'
import { sendRentPaymentReceivedNotifications, sendRentBankTransferFailedNotifications } from '@/lib/rentPaymentNotify'

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
  // Dwolla's real header is "X-Request-Signature-SHA-256" (hyphen before
  // 256) — confirmed against a live delivery's actual headers. The lookup
  // here was missing that hyphen, which is a different header name
  // entirely (not a case-sensitivity issue — Headers.get() already
  // normalizes case), so this always returned null and every real
  // delivery was rejected before the signature was ever even checked.
  const signature = request.headers.get('x-request-signature-sha-256')
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
        await sendRentBankTransferFailedNotifications(supabaseAdmin, { rentPaymentId: rentPayment.id }).catch((err) =>
          console.error('dwolla webhook: notification failed', err)
        )
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

      // rent_payments.actual_amount is a running total across every
      // payment this month (rent can be split across a partial card
      // payment plus a bank transfer, for example) — reading the Dwolla
      // transfer itself gives the exact amount THIS transfer added, not
      // the month's cumulative total.
      try {
        const transfer = await getTransfer(dwollaTransferUrl(event.resourceId))
        await sendRentPaymentReceivedNotifications(supabaseAdmin, { rentPaymentId: rentPayment.id, amount: Number(transfer.amount.value) })
      } catch (notifyErr) {
        console.error('dwolla webhook: notification failed', notifyErr)
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
