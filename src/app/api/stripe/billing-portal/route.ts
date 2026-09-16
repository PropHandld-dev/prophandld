import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'

export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!userRow?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account yet — subscribe first.' }, { status: 400 })
  }

  const stripe = getStripe()
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://prophandld.com'

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: userRow.stripe_customer_id,
      return_url: `${origin}/profile`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('billing-portal: unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
