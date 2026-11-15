'use client'

// Shared by the PM multi-client dashboard and the plain landlord
// dashboard -- same formula either way (occupancy, compliance, and rent
// collection averaged into one 0-100 score with a plain-English label),
// extracted out of landlord/pm/page.tsx so a single landlord gets the
// same at-a-glance number a PM already had, from data their dashboard
// was already fetching.
//
// `issues` and `scrollToId` turn the bare number into something
// actionable -- found live: the score alone just sat there with no way to
// find out *why*, while the dashboard's own "Needs your attention" /
// compliance list right below it already had exactly those answers,
// clickable straight through to the property.
//
// scrollToId + scrollIntoView, not an href="#id" Link: found live that a
// next/link to a same-page hash doesn't reliably scroll -- Next's client
// router treats a hash-only change on the current route as "no real
// navigation" in some cases and skips the browser's native jump-to-
// fragment behavior, so clicking looked like it did nothing. A direct
// scrollIntoView call always works regardless of that, and a smooth
// scroll is more noticeable than an instant jump would have been anyway.
export function PortfolioHealthCard({
  health,
  issues,
  scrollToId,
}: {
  health: { score: number; label: string }
  issues?: string[]
  scrollToId?: string
}) {
  const color = health.score >= 85 ? '#12A5A9' : health.score >= 60 ? '#F2B544' : '#E25555'
  const clickable = !!scrollToId
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
            {clickable && <p className="text-[#12A5A9] text-xs font-semibold mt-1.5">See what&apos;s affecting this →</p>}
          </>
        ) : (
          <p className="text-white/40 text-xs mt-1">Occupancy, compliance, and rent collection, combined</p>
        )}
      </div>
    </>
  )
  const className = 'bg-white/3 border border-white/8 rounded-2xl p-5 mb-6 flex items-center gap-5 w-full text-left'
  if (clickable) {
    return (
      <button
        type="button"
        onClick={() => document.getElementById(scrollToId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        className={`${className} hover:border-white/15 hover:bg-white/5 transition cursor-pointer`}
      >
        {content}
      </button>
    )
  }
  return <div className={className}>{content}</div>
}
