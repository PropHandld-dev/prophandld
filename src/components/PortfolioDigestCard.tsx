'use client'

import { useEffect, useState } from 'react'
import { ScrollReveal } from '@/components/ScrollReveal'
import { useLanguage, t } from '@/lib/i18n'
import { AI_ASSIST_ENABLED } from '@/lib/aiAssist'

type Nudge = { icon: 'calendar' | 'warning' | 'wrench'; text: string }

const ICON_STYLES: Record<Nudge['icon'], string> = {
  calendar: 'bg-yellow-500/15 text-yellow-400',
  warning: 'bg-red-500/15 text-red-400',
  wrench: 'bg-[#12A5A9]/15 text-[#12A5A9]',
}
const ICON_GLYPH: Record<Nudge['icon'], string> = { calendar: '📅', warning: '⚠️', wrench: '🔧' }

// Only rendered once the status fetch confirms this landlord has AI Assist
// — renders nothing at all otherwise, same as every other AI-gated card.
// Everything here is read-only: tapping through to act on a nudge happens
// on the real page (the lease, the job), never here.
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

  if (loading || !enabled || nudges.length === 0) return null

  return (
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-semibold">{t('portfolioDigestTitle', lang)}</h2>
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-full px-2 py-0.5">
          ✦ {t('aiAssistCardTitle', lang)}
        </span>
      </div>
      {summary && <p className="text-white/70 text-sm bg-white/5 border border-white/8 rounded-xl px-3.5 py-2.5 mb-3">{summary}</p>}
      <div className="space-y-2">
        {nudges.map((n, i) => (
          <div key={i} className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl px-3.5 py-2.5">
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs ${ICON_STYLES[n.icon]}`}>
              {ICON_GLYPH[n.icon]}
            </span>
            <span className="text-white/80 text-sm">{n.text}</span>
          </div>
        ))}
      </div>
    </ScrollReveal>
  )
}
