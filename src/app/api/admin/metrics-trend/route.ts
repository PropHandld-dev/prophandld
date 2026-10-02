import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'

// Same table cron/metrics-snapshot writes to, read back here — going
// through a service-role route rather than a direct client query (like the
// rest of /admin/* does for landlord_subscriptions/rent_payments/bids)
// since this is a brand-new table and its RLS shape hasn't been decided;
// no authenticated-role policy is needed at all if only this route (and
// the cron) ever touch it.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data, error } = await supabaseAdmin
    .from('admin_metrics_snapshots')
    .select('snapshot_date, mrr, landlord_count, renter_count, contractor_count, active_subscriptions, tier_free_count, tier_starter_count, tier_growth_count, tier_portfolio_count, tier_enterprise_count')
    .order('snapshot_date', { ascending: true })
    .limit(400) // well over a year of daily rows; the page itself only charts the last few months

  if (error) {
    console.error('admin/metrics-trend: error loading snapshots', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ snapshots: data || [] })
}
