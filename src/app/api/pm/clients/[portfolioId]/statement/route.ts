import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership } from '@/lib/pm'

export const maxDuration = 20

// A clean per-client monthly statement — the one thing real PM software
// (Buildium, AppFolio) treats as table stakes that this account type
// didn't have yet: rent collected vs. maintenance paid out, for one
// client, for one month, without digging through the combined dashboard.
// Not the same as a trust-account ledger (money never passes through
// Prophandld or the PM here, same as today) — just a clear read of what
// already happened in each owner's own Stripe-connected accounts.
export async function GET(request: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: portfolio } = await supabaseAdmin
    .from('pm_client_portfolios')
    .select('organization_id, owner_user_id, status, users(full_name, email)')
    .eq('id', portfolioId)
    .eq('status', 'accepted')
    .maybeSingle()

  if (!portfolio) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const isOwner = portfolio.owner_user_id === user.id
  let allowed = isOwner
  if (!allowed) {
    const membership = await getPmMembership(supabaseAdmin, user.id)
    allowed = !!membership && membership.organizationId === portfolio.organization_id && membership.canViewFinancials
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Not authorized to view this statement' }, { status: 403 })
  }

  const monthParam = request.nextUrl.searchParams.get('month') // 'YYYY-MM'
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : new Date().toISOString().slice(0, 7)
  const monthStart = `${month}-01`
  const monthEndDate = new Date(month + '-01T00:00:00')
  monthEndDate.setMonth(monthEndDate.getMonth() + 1)
  const monthEnd = monthEndDate.toISOString().slice(0, 10)

  const ownerId = portfolio.owner_user_id

  const [{ data: rent }, { data: jobs }] = await Promise.all([
    supabaseAdmin
      .from('rent_payments')
      .select('id, paid_date, actual_amount, payment_method, tenancies!inner(units!inner(unit_number, property_id, properties!inner(address, owner_user_id)))')
      .eq('tenancies.units.properties.owner_user_id', ownerId)
      .eq('stripe_status', 'succeeded')
      .gte('paid_date', monthStart)
      .lt('paid_date', monthEnd),
    supabaseAdmin
      .from('bids')
      .select('id, paid_at, amount, payment_status, jobs!inner(category, units!inner(unit_number, property_id, properties!inner(address, owner_user_id)))')
      .eq('jobs.units.properties.owner_user_id', ownerId)
      .eq('payment_status', 'paid')
      .gte('paid_at', monthStart)
      .lt('paid_at', monthEnd),
  ])

  const place = (p: any) => `${p?.address || ''}${p?.unit_number ? `, Unit ${p.unit_number}` : ''}`

  const income = (rent || []).map((r: any) => ({
    date: r.paid_date,
    place: place({ address: r.tenancies?.units?.properties?.address, unit_number: r.tenancies?.units?.unit_number }),
    method: r.payment_method,
    amount: Number(r.actual_amount || 0),
  }))

  const expenses = (jobs || []).map((b: any) => ({
    date: b.paid_at ? String(b.paid_at).slice(0, 10) : '',
    place: place({ address: b.jobs?.units?.properties?.address, unit_number: b.jobs?.units?.unit_number }),
    category: b.jobs?.category || 'Job',
    amount: Number(b.amount || 0),
  }))

  const totalIncome = income.reduce((t, r) => t + r.amount, 0)
  const totalExpenses = expenses.reduce((t, r) => t + r.amount, 0)

  return NextResponse.json({
    ownerName: (portfolio.users as any)?.full_name || (portfolio.users as any)?.email || 'Client',
    month,
    income,
    expenses,
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
  })
}
