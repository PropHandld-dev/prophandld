'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getAccountRole } from '@/lib/accountRole'
import { AiHelpChat } from '@/components/AiHelpChat'
import { AI_ASSIST_ENABLED } from '@/lib/aiAssist'
import { useLanguage, t } from '@/lib/i18n'

// A deliberately lightweight, standalone floating bubble for the AI help
// chat — NOT a restoration of FloatingChatWidget (see the comment in
// layout.tsx: that one was switched off because it ran a full inbox query,
// a Realtime subscription, and a 60-second poll on every single page load,
// a real background-load problem, not something to casually bring back
// just to surface this). This component does none of that: one plain
// getUser() call on mount, no subscription, no polling, no DB query of any
// kind beyond what AiHelpChat itself does on demand when a message is
// actually sent. Same bottom-right position as the old widget used, since
// nothing else currently occupies it — if FloatingChatWidget is ever
// restored, these two need to be reconciled into one bubble rather than
// stacked.
export function AiHelpBubble() {
  const pathname = usePathname()
  const lang = useLanguage()
  const [role, setRole] = useState<'landlord' | 'renter' | 'contractor' | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!AI_ASSIST_ENABLED) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      const r = getAccountRole(user)
      setRole(r === 'landlord' || r === 'renter' || r === 'contractor' ? r : null)
    })
  }, [])

  const isLandingPage = pathname === '/'
  const isAuthPage = ['/login', '/signup', '/forgot-password', '/reset-password'].includes(pathname)
  if (!AI_ASSIST_ENABLED || !role || isLandingPage || isAuthPage) return null

  return (
    <>
      {open && (
        <div className="fixed inset-x-4 bottom-24 sm:inset-x-auto sm:right-5 sm:w-96 z-50 motion-safe:animate-[floatUp_0.25s_ease-out]">
          <div className="bg-[#0F2138]/97 backdrop-blur-xl border border-white/10 rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col h-[70vh] sm:h-[520px]">
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-white/8 shrink-0">
              <p className="text-white text-sm font-semibold flex-1">✦ {t('aiHelpChatTitle', lang)}</p>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-white/60 hover:text-white text-lg leading-none transition shrink-0">
                ×
              </button>
            </div>
            <div className="flex-1 min-h-0 px-4 py-3">
              <AiHelpChat />
            </div>
          </div>
        </div>
      )}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-5 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] shadow-[0_10px_30px_-8px_rgba(18,165,169,0.6)] flex items-center justify-center text-white text-xl font-bold hover:scale-105 active:scale-95 transition-transform motion-safe:animate-[floatUp_0.3s_ease-out]"
          aria-label={t('aiHelpChatTitle', lang)}
        >
          ✦
        </button>
      )}
    </>
  )
}
