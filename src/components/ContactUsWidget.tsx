'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage, t } from '@/lib/i18n'

// A plain text link (matches the Terms/Privacy/Pricing row it sits in on
// Profile) that opens a centered modal — deliberately NOT a floating
// corner bubble like FloatingChatWidget, which already occupies that
// exact fixed position on every logged-in page; a second bubble there
// would collide with it rather than add anything. Reuses the same
// /api/support-escalate backend the public landing page's help widget
// already uses (rate limited there), so there's one notification path
// for "someone has a question," not two to maintain.
export function ContactUsWidget() {
  const lang = useLanguage()
  const [open, setOpen] = useState(false)
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

  const reset = () => {
    setOpen(false)
    setStatus('idle')
    setQuestion('')
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="hover:text-white/70 transition">
        {t('contactUsTitle', lang)}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 motion-safe:animate-[fadeIn_0.15s_ease-out]"
          onClick={reset}
        >
          <div
            className="w-full max-w-sm bg-[#0F2138] border border-white/10 rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <div>
                <p className="text-white text-sm font-semibold">{t('contactUsTitle', lang)}</p>
                <p className="text-white/60 text-xs mt-0.5">{t('contactUsSubtitle', lang)}</p>
              </div>
              <button onClick={reset} aria-label={t('closeBtn', lang)} className="text-white/60 hover:text-white text-lg leading-none transition shrink-0">
                ×
              </button>
            </div>

            <div className="px-5 py-4">
              {status === 'sent' ? (
                <p className="text-white/70 text-sm">{t('contactUsSentPrefix', lang)} {email}. {t('contactUsSentSuffix', lang)}</p>
              ) : (
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
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
