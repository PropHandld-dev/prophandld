import { getStripe } from '@/lib/stripe'

// A landlord's Stripe Customer object. Already exists for anyone who's
// touched a subscription (ai-assist/start-trial, subscription/checkout) —
// this reuses that id instead of creating a second, separate Customer per
// landlord, and lazily creates one the first time someone without a
// subscription saves a default payment method.
export async function getOrCreateStripeCustomer(
  supabaseAdmin: any,
  landlordId: string
): Promise<string> {
  const { data: row } = await supabaseAdmin
    .from('users')
    .select('stripe_customer_id, email, full_name')
    .eq('id', landlordId)
    .maybeSingle()

  if (row?.stripe_customer_id) return row.stripe_customer_id

  const stripe = getStripe()
  const customer = await stripe.customers.create({
    email: row?.email || undefined,
    name: row?.full_name || undefined,
    metadata: { prophandld_user_id: landlordId },
  })

  await supabaseAdmin.from('users').update({ stripe_customer_id: customer.id }).eq('id', landlordId)
  return customer.id
}

export type DefaultPaymentMethod = {
  id: string
  type: string
  label: string
  setAt: string
} | null

export async function getDefaultPaymentMethod(supabaseAdmin: any, landlordId: string): Promise<DefaultPaymentMethod> {
  const { data: row } = await supabaseAdmin
    .from('users')
    .select('default_payment_method_id, default_payment_method_type, default_payment_method_label, default_payment_method_set_at')
    .eq('id', landlordId)
    .maybeSingle()

  if (!row?.default_payment_method_id) return null
  return {
    id: row.default_payment_method_id,
    type: row.default_payment_method_type,
    label: row.default_payment_method_label,
    setAt: row.default_payment_method_set_at,
  }
}

// Format-only check, same shape as the job-payment create-payment-intent
// route's own contractor-readiness check — doesn't call Stripe to verify
// the payment method is still attachable (expired card, etc). A genuinely
// dead payment method is caught the moment an actual charge is attempted
// (manual or auto), same as it always has been for any Stripe payment
// method in this app.
export async function hasValidDefaultPaymentMethod(supabaseAdmin: any, landlordId: string): Promise<boolean> {
  const pm = await getDefaultPaymentMethod(supabaseAdmin, landlordId)
  return !!pm
}

function cardBrandLabel(brand: string | undefined): string {
  if (!brand) return 'Card'
  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

// Builds the human-readable label stored alongside the id — e.g.
// "Visa •••• 4242" or "Chase •••• 1234" — so the settings card never has
// to make a live Stripe call just to show what's on file.
export function labelForPaymentMethod(pm: {
  type: string
  card?: { brand?: string; last4?: string } | null
  us_bank_account?: { bank_name?: string | null; last4?: string } | null
}): string {
  if (pm.type === 'card' && pm.card) {
    return `${cardBrandLabel(pm.card.brand)} •••• ${pm.card.last4 || '????'}`
  }
  if (pm.type === 'us_bank_account' && pm.us_bank_account) {
    return `${pm.us_bank_account.bank_name || 'Bank account'} •••• ${pm.us_bank_account.last4 || '????'}`
  }
  return 'Payment method'
}
