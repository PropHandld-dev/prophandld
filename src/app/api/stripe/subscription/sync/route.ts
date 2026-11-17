import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { friendlyStripeError } from '@/lib/stripeErrorMessage'
import { syncLandlordSubscription } from '@/lib/subscriptionSync'

export const maxDuration = 20

export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords have a platform subscription' }, { status: 403 })
  }

  try {
    const result = await syncLandlordSubscription(getSupabaseAdmin(), user.id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true, unitCount: result.unitCount, tier: result.tier })
  } catch (err) {
    console.error('subscription/sync: unhandled error', err)
    return NextResponse.json({ error: friendlyStripeError(err, 'update your subscription') }, { status: 500 })
  }
}
