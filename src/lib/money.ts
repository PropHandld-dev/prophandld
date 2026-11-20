// One way to show a dollar amount everywhere: thousands separators and
// always two decimals ($9,999,999.00, $50.00), so a bid reads the same on
// every screen it appears on.
export function formatMoney(value: number | string | null | undefined): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '$0.00'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
