import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'
import { labelForPaymentMethod } from '@/lib/defaultPaymentMethod'

export const maxDuration = 15

// Never trusts the client's reported success — retrieves the SetupIntent
// from Stripe directly, same discipline as job-payment/confirm.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { setupIntentId } = (await request.json().catch(() => ({}))) as { setupIntentId?: string }
  if (!setupIntentId) {
    return NextResponse.json({ error: 'Missing setupIntentId' }, { status: 400 })
  }

  const stripe = getStripe()
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId, { expand: ['payment_method'] })

  if (setupIntent.metadata?.prophandld_user_id !== user.id) {
    return NextResponse.json({ error: 'Does not belong to this account' }, { status: 403 })
  }
  if (setupIntent.status !== 'succeeded') {
    return NextResponse.json({ error: 'Setup did not complete' }, { status: 400 })
  }

  const pm = setupIntent.payment_method
  if (!pm || typeof pm === 'string') {
    return NextResponse.json({ error: 'Could not read payment method' }, { status: 500 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const label = labelForPaymentMethod(pm as any)
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      default_payment_method_id: pm.id,
      default_payment_method_type: pm.type,
      default_payment_method_label: label,
      default_payment_method_set_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    console.error('default-payment-method/confirm: could not save', error)
    return NextResponse.json({ error: 'Could not save payment method' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, label })
}
