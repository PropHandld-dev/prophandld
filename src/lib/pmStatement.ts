import type { SupabaseClient } from '@supabase/supabase-js'

export type PmStatementTotals = { totalIncome: number; totalExpenses: number; net: number; incomeCount: number; expenseCount: number }

// The actual query logic behind /api/pm/clients/[portfolioId]/statement,
// pulled out so the monthly summary email cron can compute the exact
// same numbers for the exact same month without re-deriving the query.
export async function getClientMonthTotals(
  admin: SupabaseClient,
  ownerId: string,
  month: string // 'YYYY-MM'
): Promise<PmStatementTotals> {
  const monthStart = `${month}-01`
  const monthEndDate = new Date(month + '-01T00:00:00')
  monthEndDate.setMonth(monthEndDate.getMonth() + 1)
  const monthEnd = monthEndDate.toISOString().slice(0, 10)

  const [rentRes, jobsRes] = await Promise.all([
    admin
      .from('rent_payments')
      .select('actual_amount, tenancies!inner(units!inner(property_id, properties!inner(owner_user_id)))')
      .eq('tenancies.units.properties.owner_user_id', ownerId)
      .eq('stripe_status', 'succeeded')
      .gte('paid_date', monthStart)
      .lt('paid_date', monthEnd),
    admin
      .from('bids')
      .select('amount, jobs!inner(units!inner(property_id, properties!inner(owner_user_id)))')
      .eq('jobs.units.properties.owner_user_id', ownerId)
      .eq('payment_status', 'paid')
      .gte('paid_at', monthStart)
      .lt('paid_at', monthEnd),
  ])

  if (rentRes.error) console.error('pmStatement: rent query failed', rentRes.error)
  if (jobsRes.error) console.error('pmStatement: jobs query failed', jobsRes.error)

  const rent = rentRes.data || []
  const jobs = jobsRes.data || []
  const totalIncome = rent.reduce((t: number, r: any) => t + Number(r.actual_amount || 0), 0)
  const totalExpenses = jobs.reduce((t: number, b: any) => t + Number(b.amount || 0), 0)

  return { totalIncome, totalExpenses, net: totalIncome - totalExpenses, incomeCount: rent.length, expenseCount: jobs.length }
}
