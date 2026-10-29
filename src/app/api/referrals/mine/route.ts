import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// "Active" here means the referred landlord actually exceeded 1 unit
// (trial_started_at gets stamped once, the same moment subscription
// status first treats them as a real paying-eventually landlord — see
// pricingTiers.ts) — a much more honest signal than "they made an
// account," which anyone could game for free.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = getSupabaseAdmin()
  const { data: referrals, error } = await admin
    .from('referrals')
    .select('id, referred_user_id, created_at')
    .eq('referrer_user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('referrals/mine: query failed', error)
    return NextResponse.json({ error: 'Could not load referrals' }, { status: 500 })
  }

  const referredIds = (referrals || []).map((r) => r.referred_user_id)
  const { data: referredUsers } = referredIds.length > 0
    ? await admin.from('users').select('id, full_name, trial_started_at').in('id', referredIds)
    : { data: [] }
  const byId = new Map((referredUsers || []).map((u) => [u.id, u]))

  const items = (referrals || []).map((r) => {
    const referred = byId.get(r.referred_user_id)
    return {
      id: r.id,
      createdAt: r.created_at,
      referredName: referred?.full_name || 'Someone',
      active: !!referred?.trial_started_at,
    }
  })

  return NextResponse.json({ referralCode: user.id, items, activeCount: items.filter((i) => i.active).length })
}
