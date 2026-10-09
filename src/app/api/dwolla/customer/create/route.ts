import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { createVerifiedPersonalCustomer, createSendingCustomer, upgradeToVerifiedPersonal, dwollaCustomerUrl } from '@/lib/dwolla'

export const maxDuration = 20

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const role = user.app_metadata?.role
  if (role !== 'landlord' && role !== 'renter') {
    return NextResponse.json({ error: 'Only landlords and renters use Dwolla' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: userRow, error: userRowError } = await supabaseAdmin
    .from('users')
    .select('dwolla_customer_id, dwolla_customer_type, full_name, email')
    .eq('id', user.id)
    .maybeSingle()

  if (userRowError) {
    console.error('dwolla/customer/create: error fetching user row', userRowError)
    return NextResponse.json({ error: 'Could not load account' }, { status: 500 })
  }

  // Idempotent, same spirit as Stripe's onboard route reusing an existing
  // connected account — but only when the existing customer is actually
  // the right type for this role. Landlords created as 'receive-only'
  // before Dwolla's transfer rules were understood (an Unverified sender
  // can't reach a Receive-Only recipient) need a real Verified Customer
  // instead; this self-heals them the next time they touch this route,
  // rather than needing a one-off migration script.
  const expectedType = role === 'landlord' ? 'verified' : 'unverified'
  if (userRow?.dwolla_customer_id && userRow.dwolla_customer_type === expectedType) {
    return NextResponse.json({ ok: true })
  }

  const email = userRow?.email || user.email
  const nameParts = (userRow?.full_name || '').trim().split(/\s+/).filter(Boolean)
  const firstName = nameParts[0] || 'Prophandld'
  const lastName = nameParts.slice(1).join(' ') || 'User'

  if (!email) {
    return NextResponse.json({ error: 'An email is required before setting this up' }, { status: 400 })
  }

  try {
    let customer
    if (role === 'landlord') {
      const { address1, city, state, postalCode, dateOfBirth, ssnLast4 } = (await request.json()) as {
        address1?: string
        city?: string
        state?: string
        postalCode?: string
        dateOfBirth?: string
        ssnLast4?: string
      }
      if (!address1 || !city || !state || !postalCode || !dateOfBirth || !ssnLast4) {
        return NextResponse.json({ error: 'Missing identity details' }, { status: 400 })
      }
      // An existing customer (a pre-fix 'receive-only' landlord) has to be
      // upgraded in place — Dwolla customers are unique per email, so
      // calling plain create again for the same person 409s with
      // "A customer with the specified email already exists."
      if (userRow?.dwolla_customer_id) {
        customer = await upgradeToVerifiedPersonal({
          customerUrl: dwollaCustomerUrl(userRow.dwolla_customer_id),
          firstName,
          lastName,
          email,
          address1,
          city,
          state,
          postalCode,
          dateOfBirth,
          ssnLast4,
        })
      } else {
        customer = await createVerifiedPersonalCustomer({
          firstName,
          lastName,
          email,
          address1,
          city,
          state,
          postalCode,
          dateOfBirth,
          ssnLast4,
          idempotencyKey: user.id,
        })
      }
    } else {
      customer = await createSendingCustomer({
        firstName,
        lastName,
        email,
        // Dwolla requires this for an Unverified Customer as a fraud
        // signal at signup — same header the support-escalate route
        // already uses for its own IP logging.
        ipAddress: (request.headers.get('x-forwarded-for') || '127.0.0.1').split(',')[0].trim(),
        idempotencyKey: user.id,
      })
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        dwolla_customer_id: customer.id,
        dwolla_customer_type: role === 'landlord' ? 'verified' : 'unverified',
        dwolla_customer_status: 'pending',
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('dwolla/customer/create: error saving customer id', updateError)
      return NextResponse.json({ error: 'Could not save bank account setup' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    // Same reasoning as the create-transfer route: a failure here is
    // backend/account-state territory (e.g. "A customer with the specified
    // email already exists" from a stale prior setup), not a mistake the
    // user can see or fix from this form. Never forward Dwolla's internal
    // text verbatim.
    console.error('dwolla/customer/create: dwolla call failed', JSON.stringify(err?.body?._embedded?.errors || err?.body || err))
    return NextResponse.json({ error: 'Could not start bank account setup. Please try again, or contact support if this keeps happening.' }, { status: 500 })
  }
}
