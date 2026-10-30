'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t } from '@/lib/i18n'

type Turn = { role: 'user' | 'assistant'; content: string; suggestEscalate?: boolean }

// Shared chat body used both inside the Profile "Contact us" modal and the
// floating widget's "Ask AI for help" panel, so the behavior (and the
// escalate-to-a-real-person fallback) only exists in one place. Answers
// only what the help-chat route's app-knowledge prompt actually knows —
// when it isn't confident, it says so and offers the same human-escalation
// path the old static contact form always used
// (/api/support-escalate), never leaves someone stuck with just an AI.
export function AiHelpChat() {
  const lang = useLanguage()
  const [email, setEmail] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [escalating, setEscalating] = useState(false)
  const [escalateNote, setEscalateNote] = useState('')
  const [escalateStatus, setEscalateStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || null))
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns.length, sending])

  const send = async () => {
    const message = draft.trim()
    if (!message || sending) return
    setDraft('')
    setError(null)
    setTurns((prev) => [...prev, { role: 'user', content: message }])
    setSending(true)
    try {
      const res = await fetch('/api/ai-assist/help-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: turns.map((t) => ({ role: t.role, content: t.content })),
          message,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('aiHelpChatFailed', lang))
        setSending(false)
        return
      }
      setTurns((prev) => [...prev, { role: 'assistant', content: data.reply, suggestEscalate: !!data.suggestEscalate }])
    } catch {
      setError(t('aiHelpChatFailed', lang))
    }
    setSending(false)
  }

  const submitEscalate = async () => {
    if (!email) return
    setEscalateStatus('sending')
    const transcript = turns.map((t) => `${t.role === 'user' ? 'Me' : 'Assistant'}: ${t.content}`).join('\n')
    const question = [escalateNote.trim(), transcript && `--- Chat so far ---\n${transcript}`].filter(Boolean).join('\n\n')
    try {
      const res = await fetch('/api/support-escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, question }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEscalateStatus('sent')
    } catch {
      setEscalateStatus('error')
    }
  }

  if (escalating) {
    return (
      <div className="space-y-2.5">
        {escalateStatus === 'sent' ? (
          <p className="text-white/70 text-sm">{t('contactUsSentPrefix', lang)} {email}. {t('contactUsSentSuffix', lang)}</p>
        ) : (
          <>
            <p className="text-white/50 text-xs">{t('aiHelpEscalateDesc', lang)}</p>
            <textarea
              value={escalateNote}
              onChange={(e) => setEscalateNote(e.target.value)}
              placeholder={t('contactUsPlaceholder', lang)}
              maxLength={2000}
              rows={3}
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-[#12A5A9]/50 resize-none"
            />
            {email && <p className="text-white/40 text-xs">{t('contactUsReplyPrefix', lang)} {email}</p>}
            {escalateStatus === 'error' && <p className="text-red-400 text-xs">{t('contactUsError', lang)}</p>}
            <div className="flex items-center gap-2">
              <RippleButton
                onClick={submitEscalate}
                disabled={escalateStatus === 'sending' || !email}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold rounded-lg py-2.5 disabled:opacity-50 transition"
              >
                {escalateStatus === 'sending' ? t('sendingDots', lang) : t('contactUsSendBtn', lang)}
              </RippleButton>
              <button onClick={() => setEscalating(false)} className="text-white/50 hover:text-white text-xs px-2 transition">
                {t('cancel', lang)}
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto space-y-2.5 mb-2.5">
        {turns.length === 0 && (
          <p className="text-white/40 text-xs text-center py-4">{t('aiHelpChatIntro', lang)}</p>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[85%]">
              <div
                className={
                  turn.role === 'user'
                    ? 'bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white rounded-2xl rounded-br-sm px-3.5 py-2'
                    : 'bg-white/5 border border-white/10 text-white rounded-2xl rounded-bl-sm px-3.5 py-2'
                }
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{turn.content}</p>
              </div>
              {turn.role === 'assistant' && turn.suggestEscalate && (
                <button
                  onClick={() => setEscalating(true)}
                  className="text-[#12A5A9] text-xs font-semibold hover:underline mt-1"
                >
                  {t('aiHelpEscalateBtn', lang)}
                </button>
              )}
            </div>
          </div>
        ))}
        {sending && <p className="text-white/40 text-xs">{t('aiHelpChatThinking', lang)}</p>}
      </div>

      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

      <div className="flex items-center gap-2 shrink-0">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={t('aiHelpChatPlaceholder', lang)}
          maxLength={1000}
          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
        />
        <RippleButton
          onClick={send}
          disabled={sending || !draft.trim()}
          className="shrink-0 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
        >
          {t('aiLeaseQaAskBtn', lang)}
        </RippleButton>
      </div>
      <button onClick={() => setEscalating(true)} className="text-white/30 hover:text-white/60 text-[11px] mt-2 text-center transition">
        {t('aiHelpTalkToHuman', lang)}
      </button>
    </div>
  )
}
