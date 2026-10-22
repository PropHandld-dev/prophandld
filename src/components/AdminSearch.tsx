'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Result = { id: string; name: string; email: string; phone: string | null; role: 'landlord' | 'renter' | 'contractor' }

const ROLE_STYLES: Record<string, string> = {
  landlord: 'bg-[#12A5A9]/15 text-[#12A5A9]',
  renter: 'bg-purple-400/15 text-purple-300',
  contractor: 'bg-yellow-500/15 text-yellow-400',
}

// One search box, always visible in the admin header, instead of each tab
// having its own local filter scoped to that page only — the single most
// common real need (someone emails/texts in, pull up their account right
// now) shouldn't require already knowing which role-tab they're in.
// Landing destination is the existing Users tab (prefilled via ?role &
// ?q) rather than a new per-user detail page — reuses what's already
// there instead of building a second view of the same data.
export function AdminSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const handle = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => setResults(data.results || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(handle)
  }, [query])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const goTo = (r: Result) => {
    setOpen(false)
    setQuery('')
    router.push(`/admin/users?role=${r.role}&q=${encodeURIComponent(r.email)}`)
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) goTo(results[0]) }}
        placeholder="Search name, email, phone..."
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute right-0 mt-1 w-80 bg-[#0F2138] border border-white/10 rounded-xl shadow-lg z-50 max-h-80 overflow-y-auto">
          {loading ? (
            <p className="text-white/40 text-xs px-4 py-3">Searching...</p>
          ) : results.length === 0 ? (
            <p className="text-white/40 text-xs px-4 py-3">No matches.</p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                onClick={() => goTo(r)}
                className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition flex items-center justify-between gap-2 border-b border-white/5 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{r.name}</p>
                  <p className="text-white/50 text-xs truncate">{r.email}{r.phone ? ` · ${r.phone}` : ''}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_STYLES[r.role]}`}>
                  {r.role}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
