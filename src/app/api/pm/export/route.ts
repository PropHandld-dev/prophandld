import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership, getOrgManagedOwnerIds } from '@/lib/pm'

export const maxDuration = 30

// One CSV covering every client for one month -- the Statement page
// already does this per client, one at a time; this is the same line
// items, concatenated across the whole portfolio, for tax season or a
// board report where opening each client separately isn't realistic.
// Admin-only, and only with financials visibility -- same gate the
// per-client Statement route already uses.
export async function GET(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const membership = await getPmMembership(admin, user.id)
  if (!membership || !membership.canViewFinancials) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const monthParam = request.nextUrl.searchParams.get('month')
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : new Date().toISOString().slice(0, 7)
  const monthStart = `${month}-01`
  const monthEndDate = new Date(month + '-01T00:00:00')
  monthEndDate.setMonth(monthEndDate.getMonth() + 1)
  const monthEnd = monthEndDate.toISOString().slice(0, 10)

  const ownerIds = await getOrgManagedOwnerIds(admin, membership.organizationId)
  if (ownerIds.length === 0) {
    return NextResponse.json({ month, rows: [] })
  }

  const { data: owners } = await admin.from('users').select('id, full_name, email').in('id', ownerIds)
  const ownerName = new Map((owners || []).map((o: any) => [o.id, o.full_name || o.email || 'Client']))

  const [rentRes, jobsRes] = await Promise.all([
    admin
      .from('rent_payments')
      .select('paid_date, actual_amount, payment_method, tenancies!inner(units!inner(unit_number, property_id, properties!inner(address, owner_user_id)))')
      .in('tenancies.units.properties.owner_user_id', ownerIds)
      .eq('stripe_status', 'succeeded')
      .gte('paid_date', monthStart)
      .lt('paid_date', monthEnd),
    admin
      .from('bids')
      .select('paid_at, amount, jobs!inner(category, units!inner(unit_number, property_id, properties!inner(address, owner_user_id)))')
      .in('jobs.units.properties.owner_user_id', ownerIds)
      .eq('payment_status', 'paid')
      .gte('paid_at', monthStart)
      .lt('paid_at', monthEnd),
  ])

  if (rentRes.error) console.error('pm/export: rent query failed', rentRes.error)
  if (jobsRes.error) console.error('pm/export: jobs query failed', jobsRes.error)

  const place = (p: any, unitNumber?: string | null) => `${p?.address || ''}${unitNumber ? `, Unit ${unitNumber}` : ''}`

  const income = ((rentRes.data || []) as any[]).map((r) => ({
    client: ownerName.get(r.tenancies?.units?.properties?.owner_user_id) || 'Client',
    type: 'Income' as const,
    date: r.paid_date,
    place: place(r.tenancies?.units?.properties, r.tenancies?.units?.unit_number),
    detail: r.payment_method === 'bank' ? 'Rent (bank)' : 'Rent (card)',
    amount: Number(r.actual_amount || 0),
  }))
  const expenses = ((jobsRes.data || []) as any[]).map((b) => ({
    client: ownerName.get(b.jobs?.units?.properties?.owner_user_id) || 'Client',
    type: 'Expense' as const,
    date: b.paid_at ? String(b.paid_at).slice(0, 10) : '',
    place: place(b.jobs?.units?.properties, b.jobs?.units?.unit_number),
    detail: b.jobs?.category || 'Job',
    amount: Number(b.amount || 0),
  }))

  const rows = [...income, ...expenses].sort((a, b) => a.client.localeCompare(b.client) || a.date.localeCompare(b.date))

  return NextResponse.json({ month, rows })
}
