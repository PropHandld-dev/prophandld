'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { startDmThread, type DmContact, type StartedConversation } from '@/lib/dmThreads'

export function DmContactsStrip({
  myRole,
  onStart,
  onSeeAll,
}: {
  myRole: 'landlord' | 'renter' | 'contractor'
  onStart: (c: StartedConversation) => void
  onSeeAll: () => void
}) {
  const [contacts, setContacts] = useState<DmContact[]>([])
  const [startingId, setStartingId] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('get_dm_contacts').then(({ data, error }) => {
      if (error) {
        console.error('get_dm_contacts failed', error)
        return
      }
      setContacts(data || [])
    })
  }, [])

  if (contacts.length === 0) return null

  const start = async (contact: DmContact) => {
    setStartingId(contact.other_user_id)
    try {
      onStart(await startDmThread(myRole, contact))
    } catch (err) {
      console.error('Error starting conversation:', err)
    } finally {
      setStartingId(null)
    }
  }

  return (
    <div className="pb-3 mb-3 border-b border-white/8">
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-white/40 text-xs font-medium">Message someone</p>
        {contacts.length > 6 && (
          <button onClick={onSeeAll} className="text-[#12A5A9] text-xs font-semibold hover:underline">
            See all
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {contacts.slice(0, 8).map((c) => {
          const name = c.full_name || 'Unknown'
          return (
            <button
              key={c.other_user_id}
              onClick={() => start(c)}
              disabled={startingId === c.other_user_id}
              className="flex flex-col items-center gap-1 shrink-0 w-14 disabled:opacity-50"
            >
              <div className="relative w-11 h-11 rounded-full bg-gradient-to-br from-[#0A7B7E]/40 to-[#12A5A9]/40 border border-white/10 flex items-center justify-center text-white text-sm font-semibold">
                {name[0]?.toUpperCase() || '?'}
                {c.last_job_category && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#12A5A9] border-2 border-[#0F2138] flex items-center justify-center text-[8px]">
                    ↻
                  </span>
                )}
              </div>
              <span className="text-white/60 text-[10px] truncate w-full text-center">{name.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
