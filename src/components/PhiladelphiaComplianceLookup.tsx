'use client'

import { useState } from 'react'
import { MapPinIcon, AlertTriangleIcon, CheckCircleIcon } from '@/components/icons'
import { AddressAutocomplete, type AutocompletePlace } from '@/components/AddressAutocomplete'

type License = { licenseNumber: string; status: string; mostRecentIssueDate: string | null; unitCount: number | null; address: string }
type Violation = { title: string; status: string; date: string | null; caseStatus: string; address: string }

// Public, no-login read-through to the City of Philadelphia's own open
// data (not Prophandld's data or judgment) -- see the API route's own
// comment for why that framing matters. Lives on the /philadelphia page
// since that's the one place this makes sense today: Philadelphia is
// the only city this platform tracks compliance for, and the city's
// open data is Philadelphia-specific too.
export function PhiladelphiaComplianceLookup() {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ licenses: License[]; openViolations: Violation[] } | null>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/philadelphia/compliance-lookup?address=${encodeURIComponent(address.trim())}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not look that up.')
      } else {
        setResult(data)
      }
    } catch {
      setError('Could not look that up. Try again.')
    }
    setLoading(false)
  }

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-6 sm:p-8">
      <h2 className="text-white font-bold text-xl mb-1.5">Check any Philadelphia address</h2>
      <p className="text-white/50 text-sm mb-5">
        Live rental license status and open code violations, straight from the City of Philadelphia&apos;s public records.
      </p>
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2.5 mb-2">
        <div className="relative flex-1">
          <MapPinIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          <AddressAutocomplete
            value={address}
            onChange={setAddress}
            onPlaceSelected={(place: AutocompletePlace) => setAddress([place.address, place.city].filter(Boolean).join(', '))}
            placeholder="e.g. 1234 Market St"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !address.trim()}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? 'Looking up…' : 'Check address'}
        </button>
      </form>
      <p className="text-white/30 text-xs mb-5">
        Public City of Philadelphia open data, not Prophandld&apos;s own records. Not legal advice — confirm directly with{' '}
        <a href="https://www.phila.gov/departments/department-of-licenses-and-inspections/" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/50">
          L&amp;I
        </a>
        .
      </p>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}

      {result && (
        <div className="space-y-4 mt-2">
          <div className="bg-[#0C1A2E] border border-white/8 rounded-xl p-4">
            <p className="text-white/40 text-xs font-semibold mb-3 uppercase tracking-wide">Rental license</p>
            {result.licenses.length === 0 ? (
              <p className="text-white/50 text-sm flex items-center gap-2">
                <AlertTriangleIcon className="w-4 h-4 text-amber-400 shrink-0" /> No rental license found on file for that address.
              </p>
            ) : (
              <div className="space-y-3">
                {result.licenses.map((l) => (
                  <div key={l.licenseNumber} className="flex items-center justify-between gap-3 text-sm">
                    <div>
                      <p className="text-white font-medium">{l.address}</p>
                      <p className="text-white/40 text-xs mt-0.5">
                        #{l.licenseNumber}
                        {l.unitCount ? ` · ${l.unitCount} unit${l.unitCount === 1 ? '' : 's'}` : ''}
                        {l.mostRecentIssueDate ? ` · issued ${new Date(l.mostRecentIssueDate).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                        l.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}
                    >
                      {l.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#0C1A2E] border border-white/8 rounded-xl p-4">
            <p className="text-white/40 text-xs font-semibold mb-3 uppercase tracking-wide">Open violations</p>
            {result.openViolations.length === 0 ? (
              <p className="text-white/50 text-sm flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4 text-[#12A5A9] shrink-0" /> No open violations found for that address.
              </p>
            ) : (
              <div className="space-y-3">
                {result.openViolations.map((v, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <AlertTriangleIcon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-white font-medium">{v.title}</p>
                      <p className="text-white/40 text-xs mt-0.5">
                        {v.caseStatus}
                        {v.date ? ` · cited ${new Date(v.date).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
