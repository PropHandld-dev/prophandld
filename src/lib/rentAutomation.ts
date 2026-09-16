// Shared by the landlord/renter rent pages (client-side, lazy fallback)
// and the daily cron route (server-side, authoritative source). Both call
// this with a Supabase client (browser or admin) so a given tenancy's
// current-month rent_payments row always exists without anyone typing
// a month + expected amount by hand — it's derived from tenancies.rent_amount.
export async function ensureCurrentMonthRentPayment(
  supabase: { from: (table: string) => any },
  tenancyId: string,
  rentAmount: number | null
) {
  if (!rentAmount) return null

  const monthStart = new Date()
  monthStart.setDate(1)
  const month = monthStart.toISOString().slice(0, 10)

  const { data: existing } = await supabase
    .from('rent_payments')
    .select('id')
    .eq('tenancy_id', tenancyId)
    .eq('month', month)
    .maybeSingle()

  if (existing) return null

  const { data: created, error } = await supabase
    .from('rent_payments')
    .insert({ tenancy_id: tenancyId, month, expected_amount: rentAmount })
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('ensureCurrentMonthRentPayment: insert failed', { tenancyId, error })
    return null
  }

  return created?.id ?? null
}
