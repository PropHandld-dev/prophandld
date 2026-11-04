'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getAccountRole } from '@/lib/accountRole'
import { useLanguage, t } from '@/lib/i18n'
import { AiHelpChat } from '@/components/AiHelpChat'
import { AI_ASSIST_ENABLED } from '@/lib/aiAssist'
import { useAiHelpChatAccess } from '@/lib/useAiHelpChatAccess'

// Plain static form — unchanged, this is exactly what every visit used
// before AiHelpChat existed. Kept as the fallback for as long as
// AI_ASSIST_ENABLED is off (still pending team sign-off), so this entry
// point keeps working exactly as it does today regardless of that
// decision, rather than silently breaking the moment the chat version
// below replaces it.
function StaticContactForm() {
  const lang = useLanguage()
  const [email, setEmail] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || null))
  }, [])

  const submit = async () => {
    if (!email || !question.trim()) return
    setStatus('sending')
    try {
      const res = await fetch('/api/support-escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, question: question.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return <p className="text-white/70 text-sm">{t('contactUsSentPrefix', lang)} {email}. {t('contactUsSentSuffix', lang)}</p>
  }

  return (
    <div className="space-y-2.5">
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={t('contactUsPlaceholder', lang)}
        maxLength={2000}
        rows={4}
        autoFocus
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-[#12A5A9]/50 resize-none"
      />
      {email && <p className="text-white/40 text-xs">{t('contactUsReplyPrefix', lang)} {email}</p>}
      {status === 'error' && <p className="text-red-400 text-xs">{t('contactUsError', lang)}</p>}
      <button
        onClick={submit}
        disabled={status === 'sending' || !question.trim() || !email}
        className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold rounded-lg py-2.5 disabled:opacity-50 transition"
      >
        {status === 'sending' ? t('sendingDots', lang) : t('contactUsSendBtn', lang)}
      </button>
    </div>
  )
}

// A plain text link (matches the Terms/Privacy/Pricing row it sits in on
// Profile) that opens a centered modal — deliberately NOT a floating
// corner bubble like FloatingChatWidget, which already occupies that
// exact fixed position on every logged-in page; a second bubble there
// would collide with it rather than add anything.
export function ContactUsWidget() {
  const lang = useLanguage()
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<'landlord' | 'renter' | 'contractor' | null>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const r = getAccountRole(user)
      setRole(r === 'landlord' || r === 'renter' || r === 'contractor' ? r : null)
    })
  }, [])

  const access = useAiHelpChatAccess(role)
  const showChat = AI_ASSIST_ENABLED && !!access

  const close = () => {
    setOpen(false)
    // Caught live by an external audit: this popup had no accessible
    // dialog behavior at all — no role=dialog, Escape didn't dismiss it,
    // and Tab from inside it moved focus to the Home link behind it
    // instead of staying contained. Restoring focus to the link that
    // opened it is the other half of correct modal behavior, not just
    // closing the panel.
    launcherRef.current?.focus()
  }

  // Escape to close, and a focus trap so Tab/Shift+Tab cycle only
  // through the dialog's own focusable elements instead of escaping to
  // whatever sits behind it in the page.
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    dialog?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== 'Tab' || !dialog) return
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <>
      <button ref={launcherRef} onClick={() => setOpen(true)} className="hover:text-white/70 transition">
        {t('contactUsTitle', lang)}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 motion-safe:animate-[fadeIn_0.15s_ease-out]"
          onClick={close}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-us-dialog-title"
            tabIndex={-1}
            className={`w-full max-w-sm bg-[#0F2138] border border-white/10 rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col outline-none ${showChat ? 'h-[70vh] sm:h-[520px]' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
              <div>
                <p id="contact-us-dialog-title" className="text-white text-sm font-semibold">{t('contactUsTitle', lang)}</p>
                <p className="text-white/60 text-xs mt-0.5">{t('contactUsSubtitle', lang)}</p>
              </div>
              <button onClick={close} aria-label={t('closeBtn', lang)} className="text-white/60 hover:text-white text-lg leading-none transition shrink-0">
                ×
              </button>
            </div>

            <div className="px-5 py-4 flex-1 min-h-0">
              {showChat ? <AiHelpChat onNavigate={close} /> : <StaticContactForm />}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
