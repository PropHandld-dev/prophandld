'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t, type Lang } from '@/lib/i18n'
import { AI_ASSIST_ENABLED } from '@/lib/aiAssist'
import { openAiHelp } from '@/lib/openAiHelp'

type Nudge = { icon: 'calendar' | 'warning' | 'wrench'; text: string; href?: string }

const ICON_STYLES: Record<Nudge['icon'], string> = {
  calendar: 'bg-yellow-500/15 text-yellow-400',
  warning: 'bg-red-500/15 text-red-400',
  wrench: 'bg-[#12A5A9]/15 text-[#12A5A9]',
}
const ICON_GLYPH: Record<Nudge['icon'], string> = { calendar: '📅', warning: '⚠️', wrench: '🔧' }

// A typed question here doesn't get its own answer inline — it hands off
// to the floating AI help chat (free for every landlord regardless of AI
// Assist, see openAiHelp.ts), which already knows how to ground an answer
// in real account data and has the escalate-to-a-human fallback this card
// has no room for. One shared input, reused across all three card states.
function AskBar({ lang }: { lang: Lang }) {
  const [question, setQuestion] = useState('')

  const ask = () => {
    const q = question.trim()
    if (!q) return
    openAiHelp(q)
    setQuestion('')
  }

  return (
    <div className="flex items-center gap-2 mt-3">
      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && ask()}
        placeholder={t('portfolioAskPlaceholder', lang)}
        className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
      />
      <RippleButton
        onClick={ask}
        disabled={!question.trim()}
        className="shrink-0 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
      >
        {t('aiLeaseQaAskBtn', lang)}
      </RippleButton>
    </div>
  )
}

// Three states, not one: a landlord without AI Assist used to see nothing
// at all here (no hint the feature even exists), and a landlord WITH it
// but a clean portfolio also saw nothing (so the card they're paying for
// was invisible exactly when it had good news to report). Both now render
// something. Neither costs anything extra — the route already skips the
// Claude call entirely when there's nothing to flag or no access, so the
// "all clear" and upsell states are pure UI, not new spend.
export function PortfolioDigestCard() {
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [summary, setSummary] = useState('')
  const [nudges, setNudges] = useState<Nudge[]>([])

  useEffect(() => {
    if (!AI_ASSIST_ENABLED) {
      setLoading(false)
      return
    }
    fetch('/api/ai-assist/portfolio-digest')
      .then((res) => res.json())
      .then((data) => {
        setEnabled(!!data.enabled)
        setSummary(data.summary || '')
        setNudges(data.nudges || [])
      })
      .catch(() => setEnabled(false))
      .finally(() => setLoading(false))
  }, [])

  if (loading || !AI_ASSIST_ENABLED) return null

  if (!enabled) {
    return (
      <ScrollReveal className="bg-gradient-to-br from-[#0A7B7E]/10 to-white/[0.02] border border-[#12A5A9]/25 rounded-2xl p-6 mb-6">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-full px-2 py-0.5">
          ✦ {t('aiAssistCardTitle', lang)}
        </span>
        <h2 className="text-white font-semibold mt-3 mb-1.5">{t('portfolioDigestUpsellTitle', lang)}</h2>
        <p className="text-white/60 text-sm leading-relaxed mb-4">{t('portfolioDigestUpsellDesc', lang)}</p>
        <Link href="/profile#billing" className="text-[#12A5A9] text-sm font-semibold hover:underline">
          {t('portfolioDigestUpsellCta', lang)}
        </Link>
        <AskBar lang={lang} />
      </ScrollReveal>
    )
  }

  return (
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-semibold">{t('portfolioDigestTitle', lang)}</h2>
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-full px-2 py-0.5">
          ✦ {t('aiAssistCardTitle', lang)}
        </span>
      </div>
      {nudges.length === 0 ? (
        <p className="text-white/70 text-sm bg-white/5 border border-white/8 rounded-xl px-3.5 py-2.5">
          ✦ {t('portfolioDigestAllClear', lang)}
        </p>
      ) : (
        <>
          {summary && <p className="text-white/70 text-sm bg-white/5 border border-white/8 rounded-xl px-3.5 py-2.5 mb-3">{summary}</p>}
          <div className="space-y-2">
            {nudges.map((n, i) => {
              const content = (
                <>
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs ${ICON_STYLES[n.icon]}`}>
                    {ICON_GLYPH[n.icon]}
                  </span>
                  <span className="text-white/80 text-sm flex-1">{n.text}</span>
                  {n.href && <span className="text-white/30 text-xs shrink-0">→</span>}
                </>
              )
              return n.href ? (
                <Link key={i} href={n.href} className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl px-3.5 py-2.5 hover:bg-white/6 hover:border-white/15 transition">
                  {content}
                </Link>
              ) : (
                <div key={i} className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl px-3.5 py-2.5">
                  {content}
                </div>
              )
            })}
          </div>
        </>
      )}
      <AskBar lang={lang} />
    </ScrollReveal>
  )
}
