// Shared by the PM multi-client dashboard and the plain landlord
// dashboard -- same formula either way (occupancy, compliance, and rent
// collection averaged into one 0-100 score with a plain-English label),
// extracted out of landlord/pm/page.tsx so a single landlord gets the
// same at-a-glance number a PM already had, from data their dashboard
// was already fetching.
export function PortfolioHealthCard({ health }: { health: { score: number; label: string } }) {
  const color = health.score >= 85 ? '#12A5A9' : health.score >= 60 ? '#F2B544' : '#E25555'
  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6 flex items-center gap-5">
      <div
        className="w-16 h-16 rounded-full border-4 flex items-center justify-center shrink-0 tabular-nums font-bold text-lg"
        style={{ borderColor: color, color }}
      >
        {health.score}
      </div>
      <div>
        <p className="text-white font-semibold">Portfolio health</p>
        <p className="text-sm font-medium mt-0.5" style={{ color }}>
          {health.label}
        </p>
        <p className="text-white/40 text-xs mt-1">Occupancy, compliance, and rent collection, combined</p>
      </div>
    </div>
  )
}
