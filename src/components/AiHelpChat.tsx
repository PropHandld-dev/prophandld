'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t } from '@/lib/i18n'

type Turn = { role: 'user' | 'assistant'; content: string; suggestEscalate?: boolean; navLink?: { path: string; label: string } | null }

// Shared chat body used both inside the Profile "Contact us" modal and the
// floating widget's "Ask AI for help" panel, so the behavior (and the
// escalate-to-a-real-person fallback) only exists in one place. Answers
// only what the help-chat route's app-knowledge prompt actually knows —
// when it isn't confident, it says so and offers the same human-escalation
// path the old static contact form always used
// (/api/support-escalate), never leaves someone stuck with just an AI.
//
// Explicitly ephemeral (2026-11-01, product decision): used to persist 30
// days of history server-side and silently reload it on every open. Now
// nothing is saved at all — a conversation exists only in this
// component's own state, for as long as it's open, and "End Conversation"
// (or just closing the bubble, which unmounts this and wipes `turns`
// either way) is the only way it ever goes away. Users are told this up
// front rather than finding out by it just not being there next time.
export function AiHelpChat({ initialMessage }: { initialMessage?: string | null } = {}) {
  const lang = useLanguage()
  const [email, setEmail] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [escalating, setEscalating] = useState(false)
  const [escalateNote, setEscalateNote] = useState('')
  const [escalateStatus, setEscalateStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [confirmingEnd, setConfirmingEnd] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const sentInitialRef = useRef(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || null))
  }, [])

  // A question typed elsewhere on the app (the dashboard's "Ask" box, see
  // openAiHelp.ts) skips the "Start Conversation" tap entirely — typing
  // and submitting a question already is starting one.
  useEffect(() => {
    if (initialMessage && !sentInitialRef.current) {
      sentInitialRef.current = true
      setStarted(true)
      doSend(initialMessage, [])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns.length, sending])

  const doSend = async (message: string, historyOverride?: Turn[]) => {
    if (!message || sending) return
    const baseHistory = historyOverride ?? turns
    setDraft('')
    setError(null)
    setTurns((prev) => [...prev, { role: 'user', content: message }])
    setSending(true)
    try {
      const res = await fetch('/api/ai-assist/help-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: baseHistory.map((t) => ({ role: t.role, content: t.content })),
          message,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('aiHelpChatFailed', lang))
        setSending(false)
        return
      }
      setTurns((prev) => [...prev, { role: 'assistant', content: data.reply, suggestEscalate: !!data.suggestEscalate, navLink: data.navLink || null }])
    } catch {
      setError(t('aiHelpChatFailed', lang))
    }
    setSending(false)
  }

  const send = () => doSend(draft.trim())

  const endConversation = () => {
    setTurns([])
    setDraft('')
    setError(null)
    setEscalating(false)
    setConfirmingEnd(false)
    setStarted(false)
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

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <p className="text-white/70 text-sm mb-1.5">{t('aiHelpChatIntro', lang)}</p>
        <p className="text-white/40 text-xs mb-5">{t('aiHelpChatNotSavedNote', lang)}</p>
        <RippleButton
          onClick={() => setStarted(true)}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition"
        >
          {t('aiHelpStartConversationBtn', lang)}
        </RippleButton>
      </div>
    )
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
      <p className="text-white/30 text-[10px] text-center mb-2 shrink-0">{t('aiHelpChatNotSavedNote', lang)}</p>
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto space-y-2.5 mb-2.5">
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
              {turn.role === 'assistant' && turn.navLink && (
                <Link
                  href={turn.navLink.path}
                  className="inline-flex items-center gap-1 text-[#12A5A9] text-xs font-semibold hover:underline mt-1.5"
                >
                  {turn.navLink.label} →
                </Link>
              )}
              {turn.role === 'assistant' && turn.suggestEscalate && (
                <button
                  onClick={() => setEscalating(true)}
                  className="block text-[#12A5A9] text-xs font-semibold hover:underline mt-1"
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
      <div className="flex items-center justify-center gap-4 mt-2">
        <button onClick={() => setEscalating(true)} className="text-white/30 hover:text-white/60 text-[11px] transition">
          {t('aiHelpTalkToHuman', lang)}
        </button>
        <span className="text-white/15 text-[11px]">·</span>
        {confirmingEnd ? (
          <span className="flex items-center gap-2 text-[11px]">
            <span className="text-white/40">{t('aiHelpEndConfirm', lang)}</span>
            <button onClick={endConversation} className="text-red-400/80 hover:text-red-400 font-semibold transition">
              {t('aiHelpEndConversationBtn', lang)}
            </button>
            <button onClick={() => setConfirmingEnd(false)} className="text-white/40 hover:text-white/60 transition">
              {t('cancel', lang)}
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirmingEnd(true)} className="text-white/30 hover:text-white/60 text-[11px] transition">
            {t('aiHelpEndConversationBtn', lang)}
          </button>
        )}
      </div>
    </div>
  )
}
