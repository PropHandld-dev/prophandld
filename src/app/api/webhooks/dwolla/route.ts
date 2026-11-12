import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { syncDwollaRentPayment } from '@/lib/payments/dwollaProvider'

export const maxDuration = 20

// Dwolla signs the raw request body with HMAC-SHA256 keyed on the
// subscription's webhook secret, sent as a hex digest in
// X-Request-Signature-SHA-256. Checked before the body is parsed, same
// discipline as the Stripe webhook route.
function isValidSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-request-signature-sha-256')
  const webhookSecret = process.env.DWOLLA_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Missing webhook signature' }, { status: 400 })
  }

  const rawBody = await request.text()

  // timingSafeEqual throws (rather than returning false) on mismatched
  // buffer lengths, so a bad signature of the wrong length needs the
  // try/catch rather than a bare boolean check.
  let valid: boolean
  try {
    valid = isValidSignature(rawBody, signature, webhookSecret)
  } catch {
    valid = false
  }
  if (!valid) {
    console.error('dwolla webhook: signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const event = JSON.parse(rawBody) as { topic: string; resourceId: string; _links?: { resource?: { href: string } } }
  const supabaseAdmin = getSupabaseAdmin()

  try {
    switch (event.topic) {
      // Dwolla's transfer lifecycle: pending -> processed, or -> failed /
      // cancelled. No separate "processing" topic the way Stripe has a
      // payment_intent.processing event -- a transfer is 'pending' from
      // the moment it's created until one of these fires.
      case 'customer_transfer_completed':
      case 'customer_bank_transfer_creation_failed':
      case 'customer_transfer_failed':
      case 'customer_transfer_cancelled': {
        const { data: rentPayment } = await supabaseAdmin
          .from('rent_payments')
          .select('id')
          .eq('dwolla_transfer_id', event.resourceId)
          .eq('provider', 'dwolla')
          .maybeSingle()

        if (rentPayment) {
          await syncDwollaRentPayment(supabaseAdmin, rentPayment.id, event.resourceId)
        }
        break
      }

      // Fires once Dwolla finishes attaching a funding source created
      // from a Plaid exchange -- these come back pre-verified (Dwolla
      // pulled the account/routing numbers from Plaid directly), but the
      // event still confirms it landed.
      case 'customer_funding_source_verified':
      case 'customer_funding_source_added': {
        await supabaseAdmin
          .from('users')
          .update({ dwolla_funding_source_status: 'verified' })
          .eq('dwolla_funding_source_id', event.resourceId)
        break
      }

      case 'customer_funding_source_removed': {
        await supabaseAdmin
          .from('users')
          .update({ dwolla_funding_source_status: 'removed' })
          .eq('dwolla_funding_source_id', event.resourceId)
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error('dwolla webhook: handler error', event.topic, err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
