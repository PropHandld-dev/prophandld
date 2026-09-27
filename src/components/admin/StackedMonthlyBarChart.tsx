'use client'

// Same idea as MonthlyBarChart, but each month is a stack of named series
// (e.g. landlord/renter/contractor signups, or subscription tier mix)
// instead of one number — a plain-div stacked bar with a small legend,
// still no charting library.
export type StackedSeries = { key: string; label: string; color: string; valuesByMonth: Record<string, number> }
export type StackedMonthPoint = { key: string; label: string; isCurrent?: boolean }

export function StackedMonthlyBarChart({
  title,
  subtitle,
  months,
  series,
}: {
  title: string
  subtitle?: string
  months: StackedMonthPoint[]
  series: StackedSeries[]
}) {
  const totals = months.map((m) => series.reduce((sum, s) => sum + (s.valuesByMonth[m.key] || 0), 0))
  const max = Math.max(1, ...totals)
  const CHART_HEIGHT = 96

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-white font-semibold">{title}</h2>
          {subtitle && <p className="text-white/50 text-xs mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-white/50 text-[10px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-2 mt-5" style={{ height: CHART_HEIGHT + 34 }}>
        {months.map((m, i) => {
          const total = totals[i]
          const barHeight = total > 0 ? Math.max(4, Math.round((total / max) * CHART_HEIGHT)) : 2
          return (
            <div key={m.key} className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0">
              <span className="text-white/60 text-[10px] font-medium tabular-nums">{total > 0 ? total : ''}</span>
              <div className="w-full rounded-t-md overflow-hidden flex flex-col-reverse" style={{ height: barHeight }}>
                {series.map((s) => {
                  const value = s.valuesByMonth[m.key] || 0
                  if (value <= 0) return null
                  const segHeight = Math.round((value / total) * barHeight)
                  return <div key={s.key} style={{ height: segHeight, backgroundColor: s.color }} title={`${s.label}: ${value}`} />
                })}
              </div>
              <span className="text-white/40 text-[10px]">
                {m.label}
                {m.isCurrent && '*'}
              </span>
            </div>
          )
        })}
      </div>
      {months.some((m) => m.isCurrent) && (
        <p className="text-white/30 text-[10px] mt-2">* This month, still in progress</p>
      )}
    </div>
  )
}
