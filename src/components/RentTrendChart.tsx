export type MonthBucket = { key: string; label: string; rent: number }

// Shared by the PM multi-client dashboard and the plain landlord dashboard
// -- same simple CSS-bar pattern from /admin/transactions, no charting
// library needed. Extracted out of landlord/pm/page.tsx so a single
// landlord gets the same "is this getting better or worse" trend view a
// PM already had, instead of only ever seeing point-in-time stat tiles.
export function RentTrendChart({ months }: { months: MonthBucket[] }) {
  const max = Math.max(1, ...months.map((m) => m.rent))
  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6">
      <p className="text-white/50 text-xs font-semibold mb-4">Rent collected, last 6 months</p>
      <div className="flex items-end gap-2 h-28">
        {months.map((m) => (
          <div key={m.key} className="flex-1 flex flex-col items-center min-w-0 h-full">
            <p className="text-white/60 text-[10px] h-4 tabular-nums truncate max-w-full">{m.rent > 0 ? `$${m.rent.toFixed(0)}` : ''}</p>
            <div className="flex-1 w-full flex items-end min-h-0">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-[#0A7B7E] to-[#12A5A9]"
                style={{ height: `${Math.max((m.rent / max) * 100, m.rent > 0 ? 4 : 0)}%` }}
              />
            </div>
            <p className="text-white/30 text-[10px] mt-1.5">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
