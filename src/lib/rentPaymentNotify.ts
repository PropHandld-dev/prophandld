import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sendRentPaymentReceivedEmail,
  sendCreditCardRejectedEmail,
  sendBankTransferFailedEmail,
  sendLandlordBankTransferFailedEmail,
} from '@/lib/email'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'

// Shared by both rails' webhooks AND both rails' /confirm routes — whichever
// call actually wins the race to flip a rent row to paid/failed (the
// confirm route often wins, since it runs the instant the renter's own
// browser sees the payment go through, ahead of webhook delivery). Pulled
// out of the two webhook handlers, which previously had all of this and
// left both /confirm routes sending no notification at all on the (common)
// case where they win that race — the same gap job payments had before
// jobPaymentNotify.ts fixed it there.

export async function sendRentPaymentReceivedNotifications(
  supabaseAdmin: SupabaseClient,
  { rentPaymentId, amount }: { rentPaymentId: string; amount: number }
) {
  const { data: rentPayment } = await supabaseAdmin
    .from('rent_payments')
    .select('month, tenancies(renter_user_id, units(unit_number, properties(address, owner_user_id)))')
    .eq('id', rentPaymentId)
    .maybeSingle()

  const tenancy = rentPayment?.tenancies as any
  const unit = tenancy?.units
  const landlordUserId = unit?.properties?.owner_user_id
  if (!landlordUserId) return

  const monthLabel = rentPayment?.month
    ? new Date(rentPayment.month + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
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
      amount,
      monthLabel,
      unitLabel,
      lang: landlord.preferred_language === 'es' ? 'es' : 'en',
    }).catch((err) => console.error('sendRentPaymentReceivedNotifications: landlord email failed', err))
  }
  await sendPush(landlordUserId, {
    title: 'Rent payment received',
    body: `$${amount.toFixed(2)} for ${unitLabel}`,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord`,
  }).catch((err) => console.error('sendRentPaymentReceivedNotifications: sendPush failed', err))

  const renterUserId = tenancy?.renter_user_id
  if (renterUserId) {
    const { data: threadId, error: threadError } = await supabaseAdmin.rpc('start_landlord_tenant_thread', {
      p_landlord_user_id: landlordUserId,
      p_renter_user_id: renterUserId,
    })
    if (threadError) {
      console.error('sendRentPaymentReceivedNotifications: start_landlord_tenant_thread failed', threadError)
    } else if (threadId) {
      const { error: messageError } = await supabaseAdmin.from('messages').insert({
        thread_id: threadId,
        sender_user_id: renterUserId,
        body: `✓ Rent paid: $${amount.toFixed(2)} for ${monthLabel}`,
      })
      if (messageError) console.error('sendRentPaymentReceivedNotifications: message insert failed', messageError)
    }
  }
}

// Stripe-only: a credit card was used for rent, syncRentPayment refunded it
// automatically (rent only takes debit cards and bank transfers).
export async function sendRentCreditCardRejectedNotifications(
  supabaseAdmin: SupabaseClient,
  { rentPaymentId, amount }: { rentPaymentId: string; amount: number }
) {
  const { data: rentPayment } = await supabaseAdmin
    .from('rent_payments')
    .select('tenancies(renter_user_id, units(unit_number, properties(address)))')
    .eq('id', rentPaymentId)
    .maybeSingle()

  const tenancy = rentPayment?.tenancies as any
  const renterUserId = tenancy?.renter_user_id
  if (!renterUserId) return

  const unit = tenancy?.units
  const unitLabel = unit ? `${unit.properties?.address || 'your property'}${unit.unit_number ? `, Unit ${unit.unit_number}` : ''}` : null

  const { data: renter } = await supabaseAdmin
    .from('users')
    .select('email, full_name, preferred_language, email_notifications_enabled')
    .eq('id', renterUserId)
    .maybeSingle()
  if (renter?.email && emailAllowed(renter)) {
    await sendCreditCardRejectedEmail({
      to: renter.email,
      renterName: renter.full_name || 'there',
      amount,
      unitLabel,
      lang: renter.preferred_language === 'es' ? 'es' : 'en',
    }).catch((err) => console.error('sendRentCreditCardRejectedNotifications: email failed', err))
  }
  await sendPush(renterUserId, {
    title: 'Payment refunded',
    body: "Credit cards aren't accepted for rent. Use a debit card or bank account instead.",
    url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/renter/rent`,
  }).catch((err) => console.error('sendRentCreditCardRejectedNotifications: sendPush failed', err))
}

// Dwolla-only: a bank transfer bounced (insufficient funds, closed account,
// etc) — tells both the renter (rent is still due) and the landlord (so a
// payment that looked like it was processing doesn't just silently revert
// to unpaid with no explanation days later).
export async function sendRentBankTransferFailedNotifications(supabaseAdmin: SupabaseClient, { rentPaymentId }: { rentPaymentId: string }) {
  const { data: rentPayment } = await supabaseAdmin
    .from('rent_payments')
    .select('expected_amount, actual_amount, tenancies(renter_user_id, units(unit_number, properties(address, owner_user_id)))')
    .eq('id', rentPaymentId)
    .maybeSingle()

  const tenancy = rentPayment?.tenancies as any
  const renterUserId = tenancy?.renter_user_id
  const unit = tenancy?.units
  const landlordUserId = unit?.properties?.owner_user_id
  const failedAmount = Number(rentPayment?.expected_amount || 0) - Number(rentPayment?.actual_amount || 0)
  const unitLabel = unit?.properties?.address ? `${unit.properties.address}${unit.unit_number ? `, Unit ${unit.unit_number}` : ''}` : null

  let renterName: string | null = null
  if (renterUserId) {
    const { data: renter } = await supabaseAdmin
      .from('users')
      .select('email, full_name, preferred_language, email_notifications_enabled')
      .eq('id', renterUserId)
      .maybeSingle()
    renterName = renter?.full_name || null
    if (renter?.email && emailAllowed(renter)) {
      await sendBankTransferFailedEmail({
        to: renter.email,
        renterName: renter.full_name || 'there',
        amount: failedAmount > 0 ? failedAmount : null,
        unitLabel,
        lang: renter.preferred_language === 'es' ? 'es' : 'en',
      }).catch((err) => console.error('sendRentBankTransferFailedNotifications: renter email failed', err))
    }
    await sendPush(renterUserId, {
      title: "Bank transfer didn't go through",
      body: 'Rent is still due. Try again or use a debit card instead.',
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/renter/rent`,
    }).catch((err) => console.error('sendRentBankTransferFailedNotifications: renter sendPush failed', err))
  }

  if (landlordUserId) {
    const { data: landlord } = await supabaseAdmin
      .from('users')
      .select('email, full_name, preferred_language, email_notifications_enabled')
      .eq('id', landlordUserId)
      .maybeSingle()
    if (landlord?.email && emailAllowed(landlord)) {
      await sendLandlordBankTransferFailedEmail({
        to: landlord.email,
        landlordName: landlord.full_name || 'there',
        renterName,
        amount: failedAmount > 0 ? failedAmount : null,
        unitLabel,
        lang: landlord.preferred_language === 'es' ? 'es' : 'en',
      }).catch((err) => console.error('sendRentBankTransferFailedNotifications: landlord email failed', err))
    }
    await sendPush(landlordUserId, {
      title: "A rent bank transfer didn't go through",
      body: unitLabel ? `${renterName || 'Your tenant'}'s payment for ${unitLabel} bounced.` : `${renterName || 'Your tenant'}'s payment bounced.`,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord`,
    }).catch((err) => console.error('sendRentBankTransferFailedNotifications: landlord sendPush failed', err))
  }
}
