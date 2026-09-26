'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { startDmThread, type DmContact, type StartedConversation } from '@/lib/dmThreads'
import { useLanguage, t, roleLabel } from '@/lib/i18n'

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
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [contacts, setContacts] = useState<DmContact[]>([])
  const [error, setError] = useState<string | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('get_dm_contacts').then(({ data, error: rpcError }) => {
      if (rpcError) {
        console.error('get_dm_contacts failed', rpcError)
        setError(t('couldNotLoadContacts', lang))
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
      setError(t('couldNotStartConversation', lang))
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
        <p className="text-white text-sm font-semibold">{t('newMessage', lang)}</p>
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
        <>
          <p className="text-white/50 text-sm text-center py-10">{t('noOneToMessageYet', lang)}</p>
          {myRole === 'landlord' && (
            <Link href="/landlord/contractors/invite" className="block text-center text-[#12A5A9] text-xs hover:underline">
              {t('inviteContractorLink', lang)}
            </Link>
          )}
        </>
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
                <p className="text-white text-sm font-medium truncate">{c.full_name || t('unknownName', lang)}</p>
                <span className="text-[10px] bg-white/8 text-white/50 rounded-full px-1.5 py-0.5 shrink-0">{roleLabel(c.other_role, lang)}</span>
              </div>
              {c.context_label && <p className="text-white/60 text-xs truncate">{c.context_label}</p>}
              {c.last_job_category && (
                <p className="text-[#12A5A9] text-xs mt-1">
                  {t('workedWithThemBefore', lang)} {c.last_job_category}. {c.thread_id ? t('messageAgain', lang) : t('messageThemAgain', lang)}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {!loading && contacts.length > 0 && myRole === 'landlord' && (
        <Link href="/landlord/contractors/invite" className="block text-center text-[#12A5A9] text-xs hover:underline mt-3 pt-3 border-t border-white/8">
          {t('inviteContractorLink', lang)}
        </Link>
      )}
    </div>
  )
}
