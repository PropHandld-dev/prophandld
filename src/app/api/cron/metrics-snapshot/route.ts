import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { graduatedMonthlyAmount } from '@/lib/pricingTiers'

export const maxDuration = 60

// There's no historical record of MRR or subscriber counts — the admin
// overview only ever showed today's snapshot, live-computed. Rather than
// fake a "growth chart" out of data that was never recorded, this starts
// recording it for real, one row a day, so a real trend accumulates from
// here forward. Runs daily (see vercel.json); upserts on snapshot_date, so
// a rerun the same day corrects today's row instead of duplicating it.
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()

  // Same pagination the admin/users route uses — listUsers caps at 1000
  // rows per page and silently drops the rest otherwise.
  const perPage = 1000
  let page = 1
  const allUsers: any[] = []
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.error('cron/metrics-snapshot: error listing users', error)
      return NextResponse.json({ error: 'Could not list users' }, { status: 500 })
    }
    allUsers.push(...data.users)
    if (data.users.length < perPage) break
    page++
  }

  const counts: { landlord: number; renter: number; contractor: number } = { landlord: 0, renter: 0, contractor: 0 }
  for (const u of allUsers) {
    const role = u.user_metadata?.role
    if (role === 'landlord' || role === 'renter' || role === 'contractor') counts[role as 'landlord' | 'renter' | 'contractor']++
  }

  const { data: subs, error: subsError } = await admin
    .from('landlord_subscriptions')
    .select('tier, unit_count, status')

  if (subsError) {
    console.error('cron/metrics-snapshot: error loading subscriptions', subsError)
    return NextResponse.json({ error: 'Could not load subscriptions' }, { status: 500 })
  }

  const active = (subs || []).filter((s: any) => s.status === 'active' && s.tier !== 'free')
  const mrr = active.reduce((sum: number, s: any) => sum + graduatedMonthlyAmount(s.unit_count || 0), 0)

  const today = new Date()
  const snapshotDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const { error: upsertError } = await admin
    .from('admin_metrics_snapshots')
    .upsert(
      {
        snapshot_date: snapshotDate,
        mrr,
        landlord_count: counts.landlord,
        renter_count: counts.renter,
        contractor_count: counts.contractor,
        active_subscriptions: active.length,
      },
      { onConflict: 'snapshot_date' }
    )

  if (upsertError) {
    console.error('cron/metrics-snapshot: error saving snapshot', upsertError)
    return NextResponse.json({ error: 'Could not save snapshot' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, snapshotDate, mrr, ...counts, activeSubscriptions: active.length })
}
