// Shown only on preview (staging) deployments so nobody mistakes them for
// the live site. NEXT_PUBLIC_VERCEL_ENV is exposed by Vercel automatically.
export function StagingBadge() {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV !== 'preview') return null
  return (
    <div className="pointer-events-none fixed bottom-20 left-3 z-[60] rounded-full bg-yellow-400 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-black shadow-lg">
      Staging
    </div>
  )
}
