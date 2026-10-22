'use client'

import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'

type Row = {
  id: string
  email: string
  question: string
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
  resolvedByName: string | null
}

export default function AdminSupportPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch('/api/admin/support')
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Could not load questions.')
      setLoading(false)
      return
    }
    setRows(data.rows || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleToggleResolved = async (row: Row) => {
    setActioningId(row.id)
    setError(null)
    const res = await fetch('/api/admin/support/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, resolved: !row.resolved_at }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Could not update.')
      setActioningId(null)
      return
    }
    await load()
    setActioningId(null)
  }

  const open = rows.filter((r) => !r.resolved_at)
  const resolved = rows.filter((r) => r.resolved_at)

  const renderRow = (row: Row) => (
    <div key={row.id} className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
      <div className="flex items-center justify-between mb-2 gap-3">
        <a href={`mailto:${row.email}`} className="text-white font-semibold text-sm hover:underline">
          {row.email}
        </a>
        <span className={
          row.resolved_at
            ? 'text-xs font-semibold px-2.5 py-1 rounded-full bg-[#0A7B7E]/20 text-[#12A5A9] shrink-0'
            : 'text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400 shrink-0'
        }>
          {row.resolved_at ? 'Resolved' : 'Open'}
        </span>
      </div>
      <p className="text-white/50 text-xs mb-2">{new Date(row.created_at).toLocaleString()}</p>
      <p className="text-white/70 text-sm mb-3 whitespace-pre-wrap">{row.question}</p>

      {row.resolved_at && (
        <p className="text-white/40 text-[11px] mb-3">
          Marked resolved by {row.resolvedByName || 'an admin'} · {new Date(row.resolved_at).toLocaleString()}
        </p>
      )}

      <RippleButton
        onClick={() => handleToggleResolved(row)}
        disabled={actioningId === row.id}
        className={
          row.resolved_at
            ? 'bg-white/5 border border-white/10 text-white/60 text-xs font-semibold px-4 py-2 rounded-lg hover:bg-white/8 transition disabled:opacity-50'
            : 'bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50'
        }
      >
        {actioningId === row.id ? 'Working...' : row.resolved_at ? 'Reopen' : 'Mark resolved'}
      </RippleButton>
    </div>
  )

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-2">Support</h1>
      <p className="text-white/50 text-sm mb-8">Questions submitted from the landing page's &quot;ask a question&quot; widget.</p>

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
              <p className="text-white/50 text-sm mb-8">No open questions.</p>
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
