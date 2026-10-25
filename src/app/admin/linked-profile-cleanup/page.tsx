'use client'

import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'

type Account = {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
  created_at: string
  last_sign_in_at: string | null
}

// Not in the admin nav — this is a one-off cleanup tool for leftover
// linked-profile test accounts (see api/admin/linked-profile-test-accounts),
// not something there's an ongoing reason to keep visiting. Visit directly
// at /admin/linked-profile-cleanup.
export default function LinkedProfileCleanupPage() {
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch('/api/admin/linked-profile-test-accounts')
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Could not load accounts.')
    } else {
      setAccounts(data.accounts || [])
      setError(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const res = await fetch('/api/admin/linked-profile-test-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: id }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Could not delete this account.')
    }
    setDeletingId(null)
    setConfirmingId(null)
    await load()
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Linked-profile test accounts</h1>
        <p className="text-white/40 text-sm mt-1">
          Secondary accounts created by the (now-hidden) profile-switching feature — unreachable
          through the UI, still real rows in the database. Review before deleting; this is permanent.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{error}</div>
      )}

      {loading ? (
        <div className="text-white/50 text-sm">Loading...</div>
      ) : accounts.length === 0 ? (
        <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center text-white/50 text-sm">
          None found.
        </div>
      ) : (
        <ScrollReveal className="space-y-2.5">
          {accounts.map((a) => (
            <div key={a.id} className="bg-white/3 border border-white/8 rounded-2xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white text-sm font-semibold truncate">{a.full_name || 'Unnamed'}</p>
                  <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0 bg-white/8 text-white/60 capitalize">
                    {a.role || 'no role'}
                  </span>
                </div>
                <p className="text-white/50 text-xs truncate mt-0.5">{a.email}</p>
                <p className="text-white/30 text-[11px] mt-1">
                  Created {new Date(a.created_at).toLocaleDateString()}
                  {a.last_sign_in_at ? ` · Last signed in ${new Date(a.last_sign_in_at).toLocaleDateString()}` : ' · Never signed in'}
                </p>
              </div>
              <div className="shrink-0">
                {confirmingId === a.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-red-400 text-xs">Delete permanently?</span>
                    <button
                      onClick={() => handleDelete(a.id)}
                      disabled={deletingId === a.id}
                      className="bg-red-500/20 text-red-400 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-500/30 transition disabled:opacity-50"
                    >
                      {deletingId === a.id ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      className="text-white/50 hover:text-white text-xs transition"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingId(a.id)}
                    className="text-red-400/70 hover:text-red-400 text-xs font-medium transition"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </ScrollReveal>
      )}
    </AdminLayout>
  )
}
