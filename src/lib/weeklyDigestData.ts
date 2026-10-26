import type { SupabaseClient } from '@supabase/supabase-js'
import { graduatedMonthlyAmount } from '@/lib/pricingTiers'
import { getCostItemsWithTotal } from '@/lib/costItems'

// Shared by the authenticated /api/admin/weekly-digest route (the
// /admin/weekly page) and the weekly digest email cron, which has no
// admin session to authenticate with — one real computation, read by
// both, so the numbers in the email always match the numbers on the
// page. Every number here is computed live from real tables; nothing
// simulated or invented.
export async function getWeeklyDigestData(admin: SupabaseClient) {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  const weekAgoIso = weekAgo.toISOString()
  const twoWeeksAgoIso = twoWeeksAgo.toISOString()

  const inWindow = (iso: string | null, start: Date, end: Date) => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return t >= start.getTime() && t < end.getTime()
  }

  // listUsers only returns one page (1000 rows) at a time — same
  // truncation trap as everywhere else this is used in the app.
  const perPage = 1000
  let page = 1
  const allUsers: any[] = []
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.error('weeklyDigestData: error listing users', error)
      return { error: 'Could not list users' as string }
    }
    allUsers.push(...data.users)
    if (data.users.length < perPage) break
    page++
  }

  const signups: Record<'landlord' | 'renter' | 'contractor', { thisWeek: number; lastWeek: number }> = {
    landlord: { thisWeek: 0, lastWeek: 0 },
    renter: { thisWeek: 0, lastWeek: 0 },
    contractor: { thisWeek: 0, lastWeek: 0 },
  }
  for (const u of allUsers) {
    const role = u.app_metadata?.role
    if (role !== 'landlord' && role !== 'renter' && role !== 'contractor') continue
    if (inWindow(u.created_at, weekAgo, now)) signups[role as 'landlord' | 'renter' | 'contractor'].thisWeek++
    else if (inWindow(u.created_at, twoWeeksAgo, weekAgo)) signups[role as 'landlord' | 'renter' | 'contractor'].lastWeek++
  }

  const [propertiesRes, unitsRes, jobsRes, rentRes, subsRes, disputesRes, verificationsRes, snapshotRes, costRes] = await Promise.all([
    admin.from('properties').select('id, created_at').gte('created_at', twoWeeksAgoIso),
    admin.from('units').select('id, created_at').gte('created_at', twoWeeksAgoIso),
    admin
      .from('jobs')
      .select('id, category, self_completed_at, landlord_approved_at, units(unit_number, properties(address, city))')
      .eq('status', 'completed')
      .or(`self_completed_at.gte.${twoWeeksAgoIso},landlord_approved_at.gte.${twoWeeksAgoIso}`),
    admin.from('rent_payments').select('actual_amount, paid_date').eq('stripe_status', 'succeeded').gte('paid_date', twoWeeksAgo.toISOString().slice(0, 10)),
    admin.from('landlord_subscriptions').select('tier, unit_count, status'),
    admin
      .from('disputes')
      .select('id, reason, created_at, jobs(category, units(properties(address, city)))')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(8),
    admin
      .from('contractor_verifications')
      .select('id, created_at, contractor_user_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(8),
    admin
      .from('admin_metrics_snapshots')
      .select('snapshot_date, mrr')
      .lte('snapshot_date', weekAgo.toISOString().slice(0, 10))
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getCostItemsWithTotal(admin),
  ])

  if (propertiesRes.error) console.error('weeklyDigestData: properties query failed', propertiesRes.error)
  if (unitsRes.error) console.error('weeklyDigestData: units query failed', unitsRes.error)
  if (jobsRes.error) console.error('weeklyDigestData: jobs query failed', jobsRes.error)
  if (rentRes.error) console.error('weeklyDigestData: rent query failed', rentRes.error)
  if (subsRes.error) console.error('weeklyDigestData: subscriptions query failed', subsRes.error)
  if (disputesRes.error) console.error('weeklyDigestData: disputes query failed', disputesRes.error)
  if (verificationsRes.error) console.error('weeklyDigestData: verifications query failed', verificationsRes.error)

  const bucket = (rows: { created_at: string }[]) => {
    let thisWeek = 0
    let lastWeek = 0
    for (const r of rows) {
      if (inWindow(r.created_at, weekAgo, now)) thisWeek++
      else if (inWindow(r.created_at, twoWeeksAgo, weekAgo)) lastWeek++
    }
    return { thisWeek, lastWeek }
  }

  const properties = bucket(propertiesRes.data || [])
  const units = bucket(unitsRes.data || [])

  let jobsThisWeek = 0
  let jobsLastWeek = 0
  for (const j of jobsRes.data || []) {
    const completedAt = (j as any).self_completed_at || (j as any).landlord_approved_at
    if (inWindow(completedAt, weekAgo, now)) jobsThisWeek++
    else if (inWindow(completedAt, twoWeeksAgo, weekAgo)) jobsLastWeek++
  }

  let rentThisWeek = 0
  let rentLastWeek = 0
  const weekAgoDate = weekAgo.toISOString().slice(0, 10)
  const twoWeeksAgoDate = twoWeeksAgo.toISOString().slice(0, 10)
  for (const r of rentRes.data || []) {
    const d = (r as any).paid_date as string
    const amt = Number((r as any).actual_amount || 0)
    if (d >= weekAgoDate) rentThisWeek += amt
    else if (d >= twoWeeksAgoDate) rentLastWeek += amt
  }

  const mrrNow = (subsRes.data || [])
    .filter((s: any) => s.status === 'active' && s.tier !== 'free')
    .reduce((sum: number, s: any) => sum + graduatedMonthlyAmount(s.unit_count || 0), 0)
  const mrrWeekAgo = snapshotRes.data?.mrr != null ? Number(snapshotRes.data.mrr) : null

  const openDisputes = (disputesRes.data || []).map((d: any) => {
    const property = d.jobs?.units?.properties
    return {
      id: d.id,
      reason: d.reason,
      createdAt: d.created_at,
      jobCategory: d.jobs?.category || null,
      address: property ? `${property.address}${property.city ? `, ${property.city}` : ''}` : null,
    }
  })

  // No FK-embed relationship exists between contractor_verifications and
  // public.users (the admin/contractors page resolves this the same way,
  // one get_user_by_id call per row) — batch-fetch names directly instead,
  // which this route can do with the admin client without that RPC.
  const verificationRows = verificationsRes.data || []
  const contractorIds = Array.from(new Set(verificationRows.map((v: any) => v.contractor_user_id).filter(Boolean)))
  const { data: contractorUsers, error: contractorUsersError } =
    contractorIds.length > 0 ? await admin.from('users').select('id, full_name').in('id', contractorIds) : { data: [], error: null }
  if (contractorUsersError) console.error('weeklyDigestData: contractor name lookup failed', contractorUsersError)
  const nameById = new Map((contractorUsers || []).map((u: any) => [u.id, u.full_name]))

  const pendingVerifications = verificationRows.map((v: any) => ({
    id: v.id,
    createdAt: v.created_at,
    contractorName: nameById.get(v.contractor_user_id) || 'Unknown',
  }))

  return {
    error: null as string | null,
    rangeStart: weekAgoIso,
    rangeEnd: now.toISOString(),
    signups,
    properties,
    units,
    jobsCompleted: { thisWeek: jobsThisWeek, lastWeek: jobsLastWeek },
    rentCollected: { thisWeek: rentThisWeek, lastWeek: rentLastWeek },
    mrr: { now: mrrNow, weekAgo: mrrWeekAgo },
    infraCostMonthly: costRes.monthlyTotal,
    netMarginMonthly: mrrNow - costRes.monthlyTotal,
    openDisputes,
    pendingVerifications,
  }
}
