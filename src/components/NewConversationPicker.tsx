'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { startDmThread, type DmContact, type StartedConversation } from '@/lib/dmThreads'

const ROLE_LABELS: Record<string, string> = {
  renter: 'Tenant',
  contractor: 'Contractor',
  landlord: 'Landlord',
}

export type { StartedConversation }

export function NewConversationPicker({
  myRole,
  onStart,
  onCancel,
}: {
  myRole: 'landlord' | 'renter' | 'contractor'
  onStart: (c: StartedConversation) => void
  onCancel: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [contacts, setContacts] = useState<DmContact[]>([])
  const [error, setError] = useState<string | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('get_dm_contacts').then(({ data, error: rpcError }) => {
      if (rpcError) {
        console.error('get_dm_contacts failed', rpcError)
        setError('Could not load contacts.')
      } else {
        setContacts(data || [])
      }
      setLoading(false)
    })
  }, [])

  const start = async (contact: DmContact) => {
    setStartingId(contact.other_user_id)
    setError(null)
    try {
      onStart(await startDmThread(myRole, contact))
    } catch (err) {
      console.error('Error starting conversation:', err)
      setError('Could not start that conversation.')
    } finally {
      setStartingId(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-3">
      <div className="flex items-center gap-2 mb-3 px-1">
        <button onClick={onCancel} className="text-white/50 hover:text-white transition shrink-0">
          ←
        </button>
        <p className="text-white text-sm font-semibold">New message</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5 text-red-400 text-xs mb-3">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          <div className="h-16 bg-white/5 rounded-xl animate-pulse" />
          <div className="h-16 bg-white/5 rounded-xl animate-pulse" />
        </div>
      ) : contacts.length === 0 ? (
        <p className="text-white/50 text-sm text-center py-10">No one to message yet.</p>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => (
            <button
              key={c.other_user_id}
              onClick={() => start(c)}
              disabled={startingId === c.other_user_id}
              className="w-full text-left bg-white/5 hover:bg-white/8 rounded-xl p-3 transition disabled:opacity-50"
            >
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <p className="text-white text-sm font-medium truncate">{c.full_name || 'Unknown'}</p>
                <span className="text-[10px] bg-white/8 text-white/50 rounded-full px-1.5 py-0.5 shrink-0">{ROLE_LABELS[c.other_role] || c.other_role}</span>
              </div>
              {c.context_label && <p className="text-white/60 text-xs truncate">{c.context_label}</p>}
              {c.last_job_category && (
                <p className="text-[#12A5A9] text-xs mt-1">
                  You worked with them before on {c.last_job_category} — message {c.thread_id ? 'again' : 'them again'}?
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
