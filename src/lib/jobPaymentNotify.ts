import { sendJobPaymentSentEmail, sendJobPaymentReceiptEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'

// The landlord's receipt, the contractor's "you've been paid" email/push,
// and the job-chat "Payment released" message — shared by the Stripe
// webhook and /api/stripe/job-payment/confirm, whichever call actually wins
// the race to flip payment_status to 'paid' (the confirm route often wins,
// since it runs the instant the landlord's own browser sees Stripe confirm
// the charge, ahead of the webhook's own delivery). Previously only the
// webhook sent email/push here — the confirm route posted just the chat
// message, so the common case (confirm wins) left both the landlord and
// contractor without an email or push about a real payment.
export async function sendJobPaymentNotifications(
  supabaseAdmin: any,
  { bidId, baseAmountPaid, cardSurcharge = 0 }: { bidId: string; baseAmountPaid: number; cardSurcharge?: number }
) {
  const { data: bid } = await supabaseAdmin
    .from('bids')
    .select('job_id, contractor_user_id, jobs(category, units(properties(address, owner_user_id)))')
    .eq('id', bidId)
    .maybeSingle()

  const job = bid?.jobs as any
  const landlordId = job?.units?.properties?.owner_user_id

  if (bid?.contractor_user_id && landlordId) {
    const [{ data: landlord }, { data: payee }] = await Promise.all([
      supabaseAdmin.from('users').select('email, full_name, preferred_language, email_notifications_enabled').eq('id', landlordId).maybeSingle(),
      supabaseAdmin.from('users').select('full_name').eq('id', bid.contractor_user_id).maybeSingle(),
    ])
    if (landlord?.email && emailAllowed(landlord)) {
      await sendJobPaymentReceiptEmail({
        to: landlord.email,
        landlordName: landlord.full_name || 'there',
        contractorName: payee?.full_name || 'your contractor',
        amount: baseAmountPaid,
        fee: cardSurcharge,
        category: job?.category || 'your job',
        propertyLabel: job?.units?.properties?.address || 'the property',
        bidId,
        lang: landlord.preferred_language === 'es' ? 'es' : 'en',
      }).catch((err) => console.error('sendJobPaymentNotifications: landlord receipt email failed', err))
    }
    await sendPush(landlordId, {
      title: 'Payment sent',
      body: `$${baseAmountPaid.toFixed(2)} to ${payee?.full_name || 'your contractor'} for ${job?.category || 'the job'}`,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/receipts/job/${bidId}`,
    }).catch((err) => console.error('sendJobPaymentNotifications: sendPush (landlord receipt) failed', err))
  }

  if (bid?.contractor_user_id) {
    const { data: contractor } = await supabaseAdmin
      .from('users')
      .select('email, full_name, preferred_language, email_notifications_enabled')
      .eq('id', bid.contractor_user_id)
      .maybeSingle()
    if (contractor?.email && emailAllowed(contractor)) {
      await sendJobPaymentSentEmail({
        to: contractor.email,
        contractorName: contractor.full_name || 'there',
        amount: baseAmountPaid,
        category: job?.category || 'your job',
        propertyLabel: job?.units?.properties?.address || 'the property',
        bidId,
        lang: contractor.preferred_language === 'es' ? 'es' : 'en',
      }).catch((err) => console.error('sendJobPaymentNotifications: contractor email failed', err))
    }
    await sendPush(bid.contractor_user_id, {
      title: "You've been paid",
      body: `$${baseAmountPaid.toFixed(2)} for ${job?.category || 'your job'}`,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/receipts/job/${bidId}`,
    }).catch((err) => console.error('sendJobPaymentNotifications: sendPush (job payment) failed', err))
  }

  if (bid?.job_id && landlordId) {
    const { error: messageError } = await supabaseAdmin.from('messages').insert({
      job_id: bid.job_id,
      sender_user_id: landlordId,
      body: '✓ Payment released',
    })
    if (messageError) console.error('sendJobPaymentNotifications: payment-released message insert failed', messageError)
  }
}
