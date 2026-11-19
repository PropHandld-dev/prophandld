'use client'

import { useEffect, useState } from 'react'
import { AlertTriangleIcon, CheckCircleIcon } from '@/components/icons'

type License = { licenseNumber: string; status: string; mostRecentIssueDate: string | null; unitCount: number | null; address: string }
type Violation = { title: string; status: string; date: string | null; caseStatus: string; address: string }

// Auto-checks THIS property's own address against the City of Philadelphia's
// public open data, reusing the exact same endpoint the public, no-login
// /philadelphia lookup already calls -- the difference here is it runs by
// itself (no typing an address) since the property's own address is already
// on file, surfacing what the city has on record right next to what the
// landlord has self-reported, with zero extra effort on their part.
export function PropertyCityRecordCard({ address, city }: { address: string; city: string | null }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [atlasUrl, setAtlasUrl] = useState<string | null>(null)
  const [result, setResult] = useState<{ licenses: License[]; openViolations: Violation[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/philadelphia/compliance-lookup?address=${encodeURIComponent(address)}`)
      .then(async (res) => {
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(data.error || 'Could not check city records.')
          setAtlasUrl(data.atlasUrl || null)
        }
        else setResult(data)
      })
      .catch(() => {
        if (!cancelled) setError('Could not check city records.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [address])

  // Philadelphia-only data source -- same scoping the rest of this feature
  // already uses, rather than silently showing nothing useful (or worse,
  // a false "no violations found") for a property this data was never
  // going to cover.
  if (!city || city.trim().toLowerCase() !== 'philadelphia') return null

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <p className="text-white font-semibold text-sm">What the city has on file</p>
        <span className="text-[10px] font-bold uppercase tracking-wide text-white/40 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
          Live from phila.gov
        </span>
      </div>
      <p className="text-white/40 text-xs mb-4">Public City of Philadelphia records, checked automatically against this address.</p>

      {loading && <p className="text-white/40 text-sm">Checking…</p>}
      {error && (
        <p className="text-white/50 text-sm">
          {error}
          {atlasUrl && <> <a href={atlasUrl} target="_blank" rel="noopener noreferrer" className="text-[#12A5A9] font-semibold hover:underline">Open on atlas.phila.gov →</a></>}
        </p>
      )}

      {result && (
        <div className="space-y-3">
          {result.licenses.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <AlertTriangleIcon className="w-4 h-4 text-amber-400 shrink-0" /> No rental license on file for this address with the city.
            </div>
          ) : (
            result.licenses.map((l) => (
              <div key={l.licenseNumber} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/70">Rental license #{l.licenseNumber}{l.unitCount ? ` · ${l.unitCount} unit${l.unitCount === 1 ? '' : 's'}` : ''}</span>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                    l.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  {l.status}
                </span>
              </div>
            ))
          )}
          {result.openViolations.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <CheckCircleIcon className="w-4 h-4 text-[#12A5A9] shrink-0" /> No open violations on file.
            </div>
          ) : (
            result.openViolations.map((v, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-white/70">
                <AlertTriangleIcon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{v.title}{v.date ? ` · cited ${new Date(v.date).toLocaleDateString()}` : ''}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
