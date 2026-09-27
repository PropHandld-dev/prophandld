'use client'

// A dependency-free bar chart for the admin overview's monthly trends — the
// app has no charting library anywhere else, and these are simple enough
// (one number per month) not to warrant adding one. The current month is
// rendered lighter with a note, since it's still filling up and a naive
// read of "this month is lower" would otherwise misread as a slowdown.
export type MonthPoint = { key: string; label: string; value: number; isCurrent?: boolean }

export function MonthlyBarChart({
  title,
  subtitle,
  points,
  formatValue,
  color = '#12A5A9',
}: {
  title: string
  subtitle?: string
  points: MonthPoint[]
  formatValue: (n: number) => string
  color?: string
}) {
  const max = Math.max(1, ...points.map((p) => p.value))
  const CHART_HEIGHT = 96

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
      <h2 className="text-white font-semibold">{title}</h2>
      {subtitle && <p className="text-white/50 text-xs mt-0.5">{subtitle}</p>}
      <div className="flex items-end gap-2 mt-5" style={{ height: CHART_HEIGHT + 34 }}>
        {points.map((p) => {
          const barHeight = p.value > 0 ? Math.max(4, Math.round((p.value / max) * CHART_HEIGHT)) : 2
          return (
            <div key={p.key} className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0">
              <span className="text-white/60 text-[10px] font-medium tabular-nums truncate w-full text-center">
                {p.value > 0 ? formatValue(p.value) : ''}
              </span>
              <div
                className="w-full rounded-t-md"
                style={{ height: barHeight, backgroundColor: color, opacity: p.isCurrent ? 0.45 : 1 }}
              />
              <span className="text-white/40 text-[10px]">
                {p.label}
                {p.isCurrent && '*'}
              </span>
            </div>
          )
        })}
      </div>
      {points.some((p) => p.isCurrent) && (
        <p className="text-white/30 text-[10px] mt-2">* This month, still in progress</p>
      )}
    </div>
  )
}
