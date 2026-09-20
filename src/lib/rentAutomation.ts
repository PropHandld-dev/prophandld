// Shared by the landlord/renter rent pages (client-side, lazy fallback)
// and the daily cron route (server-side, authoritative source). Both call
// this with a Supabase client (browser or admin) so a given tenancy's
// rent_payments row for a given month always exists without anyone typing
// a month + expected amount by hand — it's derived from tenancies.rent_amount.
// First day of the target month and of the month after it, as YYYY-MM-DD.
// Built from date parts, never toISOString(): that converts to UTC, so an
// evening load in the US turned "the 1st" into "the 2nd" and created a
// second, unpaid row for a month that was already paid.
export function rentMonthBounds(monthsAhead = 0) {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + monthsAhead, 1)
  const next = new Date(first.getFullYear(), first.getMonth() + 1, 1)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  return { month: fmt(first), following: fmt(next), firstDate: first }
}

async function ensureRentPaymentForMonth(
  supabase: { from: (table: string) => any },
  tenancyId: string,
  rentAmount: number | null,
  monthsAhead: number
) {
  if (!rentAmount) return null

  const { month, following } = rentMonthBounds(monthsAhead)

  // Matches any row inside the calendar month, not just the exact 1st, so
  // rows that already exist under a shifted date still count.
  const { data: existing } = await supabase
    .from('rent_payments')
    .select('id')
    .eq('tenancy_id', tenancyId)
    .gte('month', month)
    .lt('month', following)
    .limit(1)

  if (existing && existing.length > 0) return null

  const { data: created, error } = await supabase
    .from('rent_payments')
    .insert({ tenancy_id: tenancyId, month, expected_amount: rentAmount })
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('ensureRentPaymentForMonth: insert failed', { tenancyId, monthsAhead, error })
    return null
  }

  return created?.id ?? null
}

export async function ensureCurrentMonthRentPayment(
  supabase: { from: (table: string) => any },
  tenancyId: string,
  rentAmount: number | null
) {
  return ensureRentPaymentForMonth(supabase, tenancyId, rentAmount, 0)
}

// Lets the renter rent page show next month's row (with an early-pay
// option) ahead of the cron/reminder job ever creating it.
export async function ensureNextMonthRentPayment(
  supabase: { from: (table: string) => any },
  tenancyId: string,
  rentAmount: number | null
) {
  return ensureRentPaymentForMonth(supabase, tenancyId, rentAmount, 1)
}
