import Link from 'next/link'

// Shared by the PM multi-client dashboard and the plain landlord
// dashboard -- same formula either way (occupancy, compliance, and rent
// collection averaged into one 0-100 score with a plain-English label),
// extracted out of landlord/pm/page.tsx so a single landlord gets the
// same at-a-glance number a PM already had, from data their dashboard
// was already fetching.
//
// `issues` and `href` turn the bare number into something actionable --
// found live: the score alone just sat there with no way to find out
// *why*, while the dashboard's own "Needs your attention" / compliance
// list right below it already had exactly those answers, clickable
// straight through to the property. This just names the top reasons
// inline and links down to that existing list instead of leaving the
// score and the list feeling disconnected.
export function PortfolioHealthCard({
  health,
  issues,
  href,
}: {
  health: { score: number; label: string }
  issues?: string[]
  href?: string
}) {
  const color = health.score >= 85 ? '#12A5A9' : health.score >= 60 ? '#F2B544' : '#E25555'
  const content = (
    <>
      <div
        className="w-16 h-16 rounded-full border-4 flex items-center justify-center shrink-0 tabular-nums font-bold text-lg"
        style={{ borderColor: color, color }}
      >
        {health.score}
      </div>
      <div className="min-w-0">
        <p className="text-white font-semibold">Portfolio health</p>
        <p className="text-sm font-medium mt-0.5" style={{ color }}>
          {health.label}
        </p>
        {issues && issues.length > 0 ? (
          <>
            <p className="text-white/50 text-xs mt-1">{issues.slice(0, 2).join(' · ')}</p>
            {href && <p className="text-[#12A5A9] text-xs font-semibold mt-1.5">See what's affecting this →</p>}
          </>
        ) : (
          <p className="text-white/40 text-xs mt-1">Occupancy, compliance, and rent collection, combined</p>
        )}
      </div>
    </>
  )
  const className = 'bg-white/3 border border-white/8 rounded-2xl p-5 mb-6 flex items-center gap-5'
  if (href) {
    return (
      <Link href={href} className={`${className} hover:border-white/15 hover:bg-white/5 transition`}>
        {content}
      </Link>
    )
  }
  return <div className={className}>{content}</div>
}
