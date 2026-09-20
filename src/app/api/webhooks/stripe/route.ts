import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe, isPayoutReady } from '@/lib/stripe'
import { sendRentPaymentReceivedEmail, sendJobPaymentSentEmail, sendCreditCardRejectedEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Missing webhook signature' }, { status: 400 })
  }

  const body = await request.text()
  const stripe = getStripe()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('stripe webhook: signature verification failed', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  try {
    switch (event.type) {
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        const status = isPayoutReady(account) ? 'active' : 'onboarding'
        const { error } = await supabaseAdmin
          .from('users')
          .update({ stripe_connect_status: status })
          .eq('stripe_connect_account_id', account.id)
        if (error) console.error('stripe webhook: account.updated update failed', error)
        break
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode === 'subscription' && session.subscription) {
          const landlordUserId = session.metadata?.prophandld_landlord_user_id
          const tier = session.metadata?.prophandld_tier
          if (landlordUserId && tier) {
            const { error } = await supabaseAdmin
              .from('landlord_subscriptions')
              .upsert(
                {
                  landlord_user_id: landlordUserId,
                  tier,
                  stripe_subscription_id: session.subscription as string,
                  status: 'active',
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'landlord_user_id' }
              )
            if (error) console.error('stripe webhook: checkout.session.completed upsert failed', error)
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const landlordUserId = subscription.metadata?.prophandld_landlord_user_id
        if (landlordUserId) {
          const status = subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : subscription.status
          const { error } = await supabaseAdmin
            .from('landlord_subscriptions')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('landlord_user_id', landlordUserId)
          if (error) console.error('stripe webhook: customer.subscription.updated failed', error)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const landlordUserId = subscription.metadata?.prophandld_landlord_user_id
        if (landlordUserId) {
          const { error } = await supabaseAdmin
            .from('landlord_subscriptions')
            .update({ tier: 'free', stripe_subscription_id: null, status: 'active', updated_at: new Date().toISOString() })
            .eq('landlord_user_id', landlordUserId)
          if (error) console.error('stripe webhook: customer.subscription.deleted failed', error)
        }
        break
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        const type = paymentIntent.metadata?.prophandld_type

        if (type === 'rent_payment') {
          const rentPaymentId = paymentIntent.metadata?.prophandld_rent_payment_id
          if (rentPaymentId) {
            // Rent only accepts debit cards or bank transfers — Stripe has no
            // "debit only" payment_method_type (credit and debit both come
            // through as 'card'), so credit cards are caught here, refunded,
            // and never marked as paid.
            let isCreditCard = false
            if (typeof paymentIntent.payment_method === 'string') {
              const paymentMethod = await stripe.paymentMethods.retrieve(paymentIntent.payment_method)
              isCreditCard = paymentMethod.card?.funding === 'credit'
            }

            if (isCreditCard) {
              await stripe.refunds.create({ payment_intent: paymentIntent.id })
              await supabaseAdmin
                .from('rent_payments')
                .update({ stripe_status: 'refunded_credit_card' })
                .eq('id', rentPaymentId)

              const { data: rentPaymentForRefund } = await supabaseAdmin
                .from('rent_payments')
                .select('tenancies(renter_user_id, units(unit_number, properties(address)))')
                .eq('id', rentPaymentId)
                .maybeSingle()

              const renterUserId = (rentPaymentForRefund?.tenancies as any)?.renter_user_id
              if (renterUserId) {
                const { data: renter } = await supabaseAdmin.from('users').select('email, full_name').eq('id', renterUserId).maybeSingle()
                if (renter?.email) {
                  await sendCreditCardRejectedEmail({ to: renter.email, renterName: renter.full_name || 'there' })
                }
                await sendPush(renterUserId, {
                  title: 'Payment refunded',
                  body: "Credit cards aren't accepted for rent. Use a debit card or bank account instead.",
                  url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://prophandld.com'}/renter/rent`,
                }).catch((err) => console.error('stripe webhook: sendPush (credit rejected) failed', err))
              }
              break
            }

            const { data: rentPayment } = await supabaseAdmin
              .from('rent_payments')
              .select('expected_amount, actual_amount, month, tenancies(unit_id, renter_user_id, units(unit_number, properties(address, owner_user_id)))')
              .eq('id', rentPaymentId)
              .maybeSingle()

            const paidSoFar = Number(rentPayment?.actual_amount || 0)
            const newActual = paidSoFar + paymentIntent.amount / 100

            const { error } = await supabaseAdmin
              .from('rent_payments')
              .update({
                actual_amount: newActual,
                paid_date: new Date().toISOString().slice(0, 10),
                payment_method: paymentIntent.payment_method_types?.includes('us_bank_account') ? 'bank' : 'card',
                stripe_status: 'succeeded',
              })
              .eq('id', rentPaymentId)
            if (error) console.error('stripe webhook: rent payment_intent.succeeded failed', error)

            const unit = (rentPayment?.tenancies as any)?.units
            const landlordUserId = unit?.properties?.owner_user_id
            if (landlordUserId) {
              const monthLabel = rentPayment?.month
                ? new Date(rentPayment.month + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                : 'this month'
              const unitLabel = unit?.properties?.address
                ? `${unit.properties.address}${unit.unit_number ? `, Unit ${unit.unit_number}` : ''}`
                : 'your unit'

              const { data: landlord } = await supabaseAdmin
                .from('users')
                .select('email, full_name')
                .eq('id', landlordUserId)
                .maybeSingle()
              if (landlord?.email) {
                await sendRentPaymentReceivedEmail({
                  to: landlord.email,
                  landlordName: landlord.full_name || 'there',
                  amount: paymentIntent.amount / 100,
                  monthLabel,
                  unitLabel,
                })
              }
              await sendPush(landlordUserId, {
                title: 'Rent payment received',
                body: `$${(paymentIntent.amount / 100).toFixed(2)} for ${unitLabel}`,
                url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://prophandld.com'}/landlord`,
              }).catch((err) => console.error('stripe webhook: sendPush (rent) failed', err))

              const renterUserId = (rentPayment?.tenancies as any)?.renter_user_id
              if (renterUserId) {
                const { data: threadId, error: threadError } = await supabaseAdmin.rpc('start_landlord_tenant_thread', {
                  p_landlord_user_id: landlordUserId,
                  p_renter_user_id: renterUserId,
                })
                if (threadError) {
                  console.error('stripe webhook: start_landlord_tenant_thread failed', threadError)
                } else if (threadId) {
                  const { error: messageError } = await supabaseAdmin.from('messages').insert({
                    thread_id: threadId,
                    sender_user_id: renterUserId,
                    body: `✓ Rent paid — $${(paymentIntent.amount / 100).toFixed(2)} for ${monthLabel}`,
                  })
                  if (messageError) console.error('stripe webhook: rent-paid message insert failed', messageError)
                }
              }
            }
          }
        }

        if (type === 'job_payment') {
          const bidId = paymentIntent.metadata?.prophandld_bid_id
          if (bidId) {
            const { error } = await supabaseAdmin
              .from('bids')
              .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
              .eq('id', bidId)
            if (error) console.error('stripe webhook: job payment_intent.succeeded failed', error)

            const { data: bid } = await supabaseAdmin
              .from('bids')
              .select('contractor_user_id, jobs(category, units(properties(address)))')
              .eq('id', bidId)
              .maybeSingle()

            if (bid?.contractor_user_id) {
              const job = bid.jobs as any
              const { data: contractor } = await supabaseAdmin
                .from('users')
                .select('email, full_name')
                .eq('id', bid.contractor_user_id)
                .maybeSingle()
              if (contractor?.email) {
                await sendJobPaymentSentEmail({
                  to: contractor.email,
                  contractorName: contractor.full_name || 'there',
                  amount: paymentIntent.amount / 100,
                  category: job?.category || 'your job',
                  propertyLabel: job?.units?.properties?.address || 'the property',
                })
              }
              await sendPush(bid.contractor_user_id, {
                title: "You've been paid",
                body: `$${(paymentIntent.amount / 100).toFixed(2)} for ${job?.category || 'your job'}`,
                url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://prophandld.com'}/contractor`,
              }).catch((err) => console.error('stripe webhook: sendPush (job payment) failed', err))
            }
          }
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        const type = paymentIntent.metadata?.prophandld_type

        if (type === 'rent_payment') {
          const rentPaymentId = paymentIntent.metadata?.prophandld_rent_payment_id
          if (rentPaymentId) {
            await supabaseAdmin
              .from('rent_payments')
              .update({ stripe_status: 'failed' })
              .eq('id', rentPaymentId)
          }
        }
        if (type === 'job_payment') {
          const bidId = paymentIntent.metadata?.prophandld_bid_id
          if (bidId) {
            await supabaseAdmin
              .from('bids')
              .update({ payment_status: 'unpaid' })
              .eq('id', bidId)
          }
        }
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error('stripe webhook: handler error', event.type, err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
