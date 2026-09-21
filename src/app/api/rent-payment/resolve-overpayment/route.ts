import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'

type Mode = 'stripe_refund' | 'external_refund' | 'apply_to_next'

const cents = (n: number) => Math.round(n * 100)
const money = (n: number) => `$${n.toFixed(2)}`

// Adds a dated line to a month's history so every change has a paper trail.
function withNote(existing: string | null, line: string) {
  const stamp = new Date().toISOString().slice(0, 10)
  return [existing, `${stamp}: ${line}`].filter(Boolean).join('\n')
}

// When a month has been paid more than it now costs (rent lowered, water bill
// removed, paid twice), the landlord settles the difference here: refund it
// through Stripe, note that it was refunded another way, or move it onto next
// month's rent as a credit.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = (await request.json()) as { rentPaymentId?: string; mode?: Mode; amount?: number }
  const { rentPaymentId, mode } = body
  if (!rentPaymentId || !mode || !['stripe_refund', 'external_refund', 'apply_to_next'].includes(mode)) {
    return NextResponse.json({ error: 'Missing or invalid request' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  const { data: rent, error } = await admin
    .from('rent_payments')
    .select('id, tenancy_id, month, expected_amount, actual_amount, notes, stripe_payment_intent_id, stripe_status, tenancies(units(properties(owner_user_id)))')
    .eq('id', rentPaymentId)
    .maybeSingle()

  if (error) {
    console.error('resolve-overpayment: error fetching rent payment', error)
    return NextResponse.json({ error: 'Could not load rent payment' }, { status: 500 })
  }

  const landlordId = (rent?.tenancies as any)?.units?.properties?.owner_user_id
  if (!rent || landlordId !== user.id) {
    return NextResponse.json({ error: 'Rent payment not found' }, { status: 404 })
  }

  const expected = Number(rent.expected_amount)
  const actual = Number(rent.actual_amount || 0)
  const overpaid = Math.round((actual - expected) * 100) / 100
  if (overpaid <= 0) {
    return NextResponse.json({ error: 'This month is not overpaid.' }, { status: 400 })
  }

  const amount = body.amount === undefined ? overpaid : Math.round(Number(body.amount) * 100) / 100
  if (!(amount > 0) || amount > overpaid) {
    return NextResponse.json({ error: `Enter an amount between $0.01 and ${money(overpaid)}.` }, { status: 400 })
  }

  // Every branch changes this month's paid amount only if it hasn't moved
  // since it was read, so a double click can't refund twice.
  const lowerThisMonth = async (line: string) => {
    const { data: updated, error: updateError } = await admin
      .from('rent_payments')
      .update({ actual_amount: Math.round((actual - amount) * 100) / 100, notes: withNote(rent.notes, line) })
      .eq('id', rent.id)
      .eq('actual_amount', rent.actual_amount)
      .select('id')
    if (updateError || !updated || updated.length === 0) {
      console.error('resolve-overpayment: could not update rent payment', updateError)
      return false
    }
    return true
  }

  if (mode === 'external_refund') {
    const ok = await lowerThisMonth(`Refunded ${money(amount)} to the tenant outside the app`)
    if (!ok) return NextResponse.json({ error: 'Could not save. Refresh and try again.' }, { status: 409 })
    return NextResponse.json({ ok: true })
  }

  if (mode === 'apply_to_next') {
    const monthDate = new Date(rent.month + 'T00:00:00')
    const nextDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1)
    const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-01`

    const { data: next } = await admin
      .from('rent_payments')
      .select('id, month, expected_amount, actual_amount, notes')
      .eq('tenancy_id', rent.tenancy_id)
      .eq('month', nextMonth)
      .maybeSingle()

    if (!next) {
      return NextResponse.json({ error: "Next month hasn't been created yet, so there's nothing to apply the credit to." }, { status: 400 })
    }

    const nextDue = Math.round((Number(next.expected_amount) - Number(next.actual_amount || 0)) * 100) / 100
    if (nextDue <= 0) {
      return NextResponse.json({ error: 'Next month is already fully paid.' }, { status: 400 })
    }
    if (amount > nextDue) {
      return NextResponse.json({ error: `Next month only has ${money(nextDue)} left to pay, so at most that much can be applied.` }, { status: 400 })
    }

    const monthLabel = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    // Credit the next month first; if lowering this one then fails, undo it.
    // An unpaid month stores its paid amount as empty (null), not 0, so the
    // "hasn't changed since I read it" check has to match null explicitly.
    let creditQuery = admin
      .from('rent_payments')
      .update({
        actual_amount: Math.round((Number(next.actual_amount || 0) + amount) * 100) / 100,
        notes: withNote(next.notes, `${money(amount)} credit applied from ${monthLabel(rent.month)}`),
      })
      .eq('id', next.id)
    creditQuery = next.actual_amount === null || next.actual_amount === undefined
      ? creditQuery.is('actual_amount', null)
      : creditQuery.eq('actual_amount', next.actual_amount)
    const { data: credited, error: nextError } = await creditQuery.select('id')
    if (nextError || !credited || credited.length === 0) {
      console.error('resolve-overpayment: could not credit next month', nextError)
      return NextResponse.json({ error: 'Could not apply the credit. Refresh and try again.' }, { status: 409 })
    }

    const ok = await lowerThisMonth(`${money(amount)} overpayment applied as credit to ${monthLabel(next.month)}`)
    if (!ok) {
      await admin.from('rent_payments').update({ actual_amount: next.actual_amount ?? null, notes: next.notes }).eq('id', next.id)
      return NextResponse.json({ error: 'Could not save. Refresh and try again.' }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  }

  // stripe_refund
  if (!rent.stripe_payment_intent_id || rent.stripe_status !== 'succeeded') {
    return NextResponse.json(
      { error: "This month wasn't paid through Stripe, so it can't be refunded there. Use “Refunded another way” instead." },
      { status: 400 }
    )
  }

  const stripe = getStripe()
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(rent.stripe_payment_intent_id, { expand: ['latest_charge'] })
    const charge =
      paymentIntent.latest_charge && typeof paymentIntent.latest_charge !== 'string' ? paymentIntent.latest_charge : null
    if (paymentIntent.status !== 'succeeded' || !charge) {
      return NextResponse.json({ error: 'The original payment is not refundable.' }, { status: 400 })
    }
    const refundable = charge.amount - charge.amount_refunded
    if (cents(amount) > refundable) {
      return NextResponse.json(
        { error: `Only ${money(refundable / 100)} of the online payment can still be refunded.` },
        { status: 400 }
      )
    }

    await stripe.refunds.create(
      {
        payment_intent: paymentIntent.id,
        amount: cents(amount),
        // Takes the money back from your Stripe balance; without this the
        // platform would refund the tenant out of its own funds.
        reverse_transfer: true,
        metadata: { prophandld_rent_payment_id: rent.id, prophandld_reason: 'rent_overpayment' },
      },
      { idempotencyKey: `rent-overpay-${rent.id}-${cents(amount)}-${cents(actual)}` }
    )
  } catch (err) {
    console.error('resolve-overpayment: stripe refund failed', err)
    const message = err instanceof Error ? err.message : 'The refund could not be created.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const ok = await lowerThisMonth(`Refunded ${money(amount)} to the tenant through Stripe`)
  if (!ok) {
    // The refund went through at Stripe; the page just needs to catch up.
    console.error('resolve-overpayment: refund created but rent row not updated', { rentPaymentId: rent.id, amount })
    return NextResponse.json({ error: 'The refund was sent, but the page could not update. Refresh to see it.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
