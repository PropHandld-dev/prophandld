'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'

export default function AdminDisputesPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [outcomeById, setOutcomeById] = useState<Record<string, 'landlord' | 'contractor' | 'other'>>({})
  const [notesById, setNotesById] = useState<Record<string, string>>({})

  const load = async () => {
    const { data, error: loadError } = await supabase
      .from('disputes')
      .select('*, jobs(category, units(properties(address, city))), raiser:raised_by_user_id(full_name)')
      .order('created_at', { ascending: false })

    if (loadError) {
      console.error('Error loading disputes:', loadError)
      setError('Could not load disputes.')
      setLoading(false)
      return
    }

    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleResolve = async (id: string) => {
    const outcome = outcomeById[id] || 'other'
    setActioningId(id)
    setError(null)

    const res = await fetch('/api/disputes/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disputeId: id, outcome, resolutionNotes: notesById[id] || null }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Could not resolve dispute.')
      setActioningId(null)
      return
    }

    await load()
    setActioningId(null)
  }

  const open = rows.filter((r) => r.status === 'open')
  const resolved = rows.filter((r) => r.status === 'resolved')

  const renderRow = (row: any) => {
    const job = row.jobs as any
    const property = job?.units?.properties
    return (
      <div key={row.id} className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-white font-semibold">{job?.category || 'Unknown job'}</p>
            <p className="text-white/60 text-xs">{property?.address}{property?.city ? `, ${property.city}` : ''}</p>
          </div>
          <span className={
            row.status === 'open'
              ? 'text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400'
              : 'text-xs font-semibold px-2.5 py-1 rounded-full bg-[#0A7B7E]/20 text-[#12A5A9]'
          }>
            {row.status === 'open' ? 'Open' : `Resolved: ${row.outcome}`}
          </span>
        </div>

        <p className="text-white/50 text-xs mb-2">Raised by {row.raiser?.full_name || 'Unknown'} ({row.raised_by_role})</p>
        <p className="text-white/70 text-sm mb-3">{row.reason}</p>

        {row.status === 'resolved' && row.resolution_notes && (
          <p className="text-white/60 text-xs italic mb-3">Resolution: {row.resolution_notes}</p>
        )}

        {row.status === 'open' && (
          <div className="space-y-3 pt-3 border-t border-white/8">
            <div className="flex gap-2">
              {(['landlord', 'contractor', 'other'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setOutcomeById({ ...outcomeById, [row.id]: opt })}
                  className={
                    (outcomeById[row.id] || 'other') === opt
                      ? 'text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white'
                      : 'text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/5 text-white/50 hover:bg-white/8 transition'
                  }
                >
                  {opt === 'landlord' ? 'Favor landlord' : opt === 'contractor' ? 'Favor contractor' : 'Other'}
                </button>
              ))}
            </div>
            <textarea
              placeholder="Resolution notes (sent to all parties)"
              value={notesById[row.id] || ''}
              onChange={(e) => setNotesById({ ...notesById, [row.id]: e.target.value })}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none"
            />
            <RippleButton
              onClick={() => handleResolve(row.id)}
              disabled={actioningId === row.id}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {actioningId === row.id ? 'Resolving...' : 'Resolve dispute'}
            </RippleButton>
          </div>
        )}
      </div>
    )
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-8">Disputes</h1>

      {loading ? (
        <div className="text-white/50 text-sm">Loading...</div>
      ) : (
        <>
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
              {error}
            </div>
          )}

          <ScrollReveal>
            <h2 className="text-white/70 font-semibold text-sm mb-3">Open ({open.length})</h2>
            {open.length === 0 ? (
              <p className="text-white/50 text-sm mb-8">No open disputes.</p>
            ) : (
              <div className="mb-8">{open.map(renderRow)}</div>
            )}
          </ScrollReveal>

          <ScrollReveal>
            <h2 className="text-white/70 font-semibold text-sm mb-3">Resolved ({resolved.length})</h2>
            {resolved.length === 0 ? (
              <p className="text-white/50 text-sm">Nothing resolved yet.</p>
            ) : (
              <div>{resolved.map(renderRow)}</div>
            )}
          </ScrollReveal>
        </>
      )}
    </AdminLayout>
  )
}
