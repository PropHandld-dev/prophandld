'use client'

import { useEffect, useRef, useState } from 'react'
import { SparklesIcon } from '@/components/icons'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const STARTERS = ['How does bidding work?', 'How much does it cost?', 'Is rent payment safe?']

export function LandingAIChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [offerEscalate, setOfferEscalate] = useState(false)
  const [escalateOpen, setEscalateOpen] = useState(false)
  const [escalateEmail, setEscalateEmail] = useState('')
  const [escalateStatus, setEscalateStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    const next = [...messages, { role: 'user' as const, content: trimmed }]
    setMessages(next)
    setInput('')
    setSending(true)
    setOfferEscalate(false)
    try {
      const res = await fetch('/api/support-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      setMessages([...next, { role: 'assistant', content: data.reply }])
      setOfferEscalate(!!data.shouldEscalate)
    } catch {
      setMessages([...next, { role: 'assistant', content: "Sorry, something went wrong on my end. You can email our team instead." }])
      setOfferEscalate(true)
    } finally {
      setSending(false)
    }
  }

  const submitEscalation = async () => {
    const lastQuestion = [...messages].reverse().find((m) => m.role === 'user')?.content || ''
    if (!escalateEmail.trim() || !lastQuestion) return
    setEscalateStatus('sending')
    try {
      const res = await fetch('/api/support-escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: escalateEmail.trim(), question: lastQuestion, transcript: messages }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEscalateStatus('sent')
    } catch {
      setEscalateStatus('error')
    }
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-x-4 bottom-24 sm:inset-x-auto sm:right-5 sm:w-96 z-50 motion-safe:animate-[floatUp_0.25s_ease-out]"
          style={{ transformOrigin: 'bottom right' }}
        >
          <div className="bg-[#0F2138]/97 backdrop-blur-xl border border-white/10 rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col h-[70vh] sm:h-[520px]">
            <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-white/8 shrink-0">
              <div className="w-7 h-7 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] flex items-center justify-center shrink-0">
                <SparklesIcon className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-semibold">Ask Prophandld</p>
                <p className="text-white/40 text-xs">AI assistant</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white text-lg leading-none transition shrink-0">
                ×
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-white/40 text-sm">Ask me anything about Prophandld — pricing, how bidding works, rent payments, disputes.</p>
                  <div className="flex flex-col gap-2">
                    {STARTERS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="text-left text-xs text-white/70 bg-white/5 hover:bg-white/10 rounded-xl px-3 py-2 transition"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white'
                        : 'bg-white/8 text-white/85'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-white/8 rounded-2xl px-3.5 py-2.5 flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 motion-safe:animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 motion-safe:animate-pulse [animation-delay:0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 motion-safe:animate-pulse [animation-delay:0.3s]" />
                  </div>
                </div>
              )}

              {offerEscalate && !escalateOpen && (
                <button
                  onClick={() => setEscalateOpen(true)}
                  className="w-full text-center text-[#12A5A9] text-xs font-semibold bg-[#12A5A9]/10 hover:bg-[#12A5A9]/15 rounded-xl py-2.5 transition"
                >
                  Email our team about this →
                </button>
              )}

              {escalateOpen && (
                <div className="bg-white/5 rounded-xl p-3 space-y-2">
                  {escalateStatus === 'sent' ? (
                    <p className="text-white/70 text-xs">Sent — we&apos;ll follow up at {escalateEmail}. Check your email for confirmation.</p>
                  ) : (
                    <>
                      <p className="text-white/50 text-xs">We&apos;ll email your question to our team and send you a confirmation.</p>
                      <input
                        type="email"
                        value={escalateEmail}
                        onChange={(e) => setEscalateEmail(e.target.value)}
                        placeholder="you@email.com"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50"
                      />
                      {escalateStatus === 'error' && <p className="text-red-400 text-xs">Couldn&apos;t send — try again.</p>}
                      <button
                        onClick={submitEscalation}
                        disabled={escalateStatus === 'sending' || !escalateEmail.trim()}
                        className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold rounded-lg py-2 disabled:opacity-50 transition"
                      >
                        {escalateStatus === 'sending' ? 'Sending…' : 'Send to our team'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                send(input)
              }}
              className="flex items-center gap-2 px-3 py-3 border-t border-white/8 shrink-0"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question…"
                maxLength={2000}
                className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="w-9 h-9 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] flex items-center justify-center text-white disabled:opacity-40 shrink-0 transition"
                aria-label="Send"
              >
                →
              </button>
            </form>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-24 right-5 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] shadow-[0_10px_30px_-8px_rgba(18,165,169,0.6)] flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform motion-safe:animate-[floatUp_0.3s_ease-out]"
        aria-label="Ask Prophandld"
      >
        {open ? <span className="text-2xl leading-none">×</span> : <SparklesIcon className="w-6 h-6" />}
      </button>
    </>
  )
}
