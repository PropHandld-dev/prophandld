'use client'

import { useState } from 'react'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t } from '@/lib/i18n'

type Exchange = { question: string; answer: string }

// Only rendered by the parent once it's confirmed the renter's landlord
// has AI Assist active (see renter/documents/page.tsx) — the route itself
// also re-checks server-side, this is just what decides whether the card
// shows up at all.
export function LeaseQaCard() {
  const lang = useLanguage()
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<Exchange[]>([])
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ask = async (text?: string) => {
    const q = (text ?? question).trim()
    if (!q) return
    setAsking(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-assist/lease-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('aiLeaseQaFailed', lang))
        setAsking(false)
        return
      }
      setHistory((prev) => [...prev, { question: q, answer: data.answer }])
      setQuestion('')
    } catch {
      setError(t('aiLeaseQaFailed', lang))
    }
    setAsking(false)
  }

  return (
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-white font-semibold">{t('aiLeaseQaTitle', lang)}</h2>
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-full px-2 py-0.5">✦ AI</span>
      </div>
      <p className="text-white/50 text-xs mb-4">{t('aiLeaseQaSubtitle', lang)}</p>

      {history.length === 0 && (
        <button
          type="button"
          onClick={() => ask(t('aiLeaseQaRentChangeSuggestion', lang))}
          disabled={asking}
          className="text-xs font-semibold text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-lg px-3 py-1.5 mb-4 hover:bg-[#12A5A9]/15 transition disabled:opacity-50"
        >
          {t('aiLeaseQaRentChangeSuggestion', lang)}
        </button>
      )}

      {history.length > 0 && (
        <div className="space-y-3 mb-4">
          {history.map((ex, i) => (
            <div key={i}>
              <p className="text-white/70 text-sm font-medium mb-1">{ex.question}</p>
              <p className="text-white/50 text-sm bg-white/5 border border-white/8 rounded-xl px-3.5 py-2.5">{ex.answer}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-red-400 text-xs mb-3">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(undefined)}
          placeholder={t('aiLeaseQaPlaceholder', lang)}
          maxLength={500}
          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
        />
        <RippleButton
          onClick={() => ask()}
          disabled={asking || !question.trim()}
          className="shrink-0 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
        >
          {asking ? t('aiLeaseQaAsking', lang) : t('aiLeaseQaAskBtn', lang)}
        </RippleButton>
      </div>
      <p className="text-white/30 text-[11px] mt-3">{t('aiLeaseQaDisclaimer', lang)}</p>
    </ScrollReveal>
  )
}
