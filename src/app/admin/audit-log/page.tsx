'use client'

import { useEffect, useMemo, useState } from 'react'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'

type Entry = {
  id: string
  action_type: string
  actor_user_id: string | null
  actor_email: string | null
  target_user_id: string | null
  target_email: string | null
  target_role: string | null
  detail: Record<string, any>
  created_at: string
}

const ACTION_LABELS: Record<string, string> = {
  account_deleted: 'Account deleted',
  admin_login: 'Admin login',
  dispute_resolved: 'Dispute resolved',
  contractor_verification_decision: 'Contractor verification decision',
}

const ACTION_COLORS: Record<string, string> = {
  account_deleted: 'bg-red-500/15 text-red-400',
  admin_login: 'bg-white/8 text-white/60',
  dispute_resolved: 'bg-[#0A7B7E]/20 text-[#12A5A9]',
  contractor_verification_decision: 'bg-yellow-500/15 text-yellow-400',
}

function detailLine(entry: Entry): string | null {
  const d = entry.detail || {}
  switch (entry.action_type) {
    case 'account_deleted':
      return `${entry.target_email || 'unknown'} (${entry.target_role || 'unknown role'}) deleted their own account.`
    case 'dispute_resolved':
      return `Outcome: ${d.outcome || 'unknown'}`
    case 'contractor_verification_decision':
      return `${entry.target_email || 'contractor'}: ${d.approved ? 'approved' : 'rejected'}${d.notes ? ` — "${d.notes}"` : ''}`
    case 'admin_login':
      return null
    default:
      return null
  }
}

export default function AdminAuditLogPage() {
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<Entry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    fetch('/api/admin/audit-log')
      .then((r) => r.json())
      .then((json) => (json.error ? setError(json.error) : setEntries(json.entries || [])))
      .catch(() => setError('Could not load the audit log.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => e.action_type === filter)),
    [entries, filter]
  )

  const actionTypes = useMemo(() => Array.from(new Set(entries.map((e) => e.action_type))), [entries])

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-2">Audit log</h1>
      <p className="text-white/40 text-sm mb-8">
        Who did what: admin logins, account deletions, dispute resolutions, and contractor verification decisions.
      </p>

      {loading ? (
        <div className="text-white/50 text-sm">Loading...</div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={
                filter === 'all'
                  ? 'text-xs font-semibold px-3 py-1.5 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white'
                  : 'text-xs font-semibold px-3 py-1.5 rounded-full bg-white/5 text-white/50 hover:bg-white/8 transition'
              }
            >
              All ({entries.length})
            </button>
            {actionTypes.map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={
                  filter === type
                    ? 'text-xs font-semibold px-3 py-1.5 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white'
                    : 'text-xs font-semibold px-3 py-1.5 rounded-full bg-white/5 text-white/50 hover:bg-white/8 transition'
                }
              >
                {ACTION_LABELS[type] || type} ({entries.filter((e) => e.action_type === type).length})
              </button>
            ))}
          </div>

          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            {filtered.length === 0 ? (
              <p className="text-white/50 text-sm p-6">Nothing here yet.</p>
            ) : (
              filtered.map((entry) => (
                <div key={entry.id} className="px-6 py-4 border-b border-white/5 last:border-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${ACTION_COLORS[entry.action_type] || 'bg-white/8 text-white/60'}`}>
                      {ACTION_LABELS[entry.action_type] || entry.action_type}
                    </span>
                    <span className="text-white/40 text-xs">{new Date(entry.created_at).toLocaleString()}</span>
                  </div>
                  {entry.actor_email && (
                    <p className="text-white/60 text-xs mt-1">By {entry.actor_email}</p>
                  )}
                  {detailLine(entry) && <p className="text-white/70 text-sm mt-1">{detailLine(entry)}</p>}
                </div>
              ))
            )}
          </ScrollReveal>
        </>
      )}
    </AdminLayout>
  )
}
