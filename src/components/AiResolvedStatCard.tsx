'use client'

import { useEffect, useState } from 'react'
import { ScrollReveal } from '@/components/ScrollReveal'
import { supabase } from '@/lib/supabase'
import { useLanguage, t } from '@/lib/i18n'

// The one place a landlord can actually see Prophandld AI earning its own
// subscription — a tenant's issue that got fixed with a one-line chat
// instead of a contractor visit leaves no other trace anywhere (it's
// deliberately not a job, see 2026-11-02-ai-troubleshoot-resolutions.sql).
// Stays fully invisible (not even a "0 resolved" placeholder) until
// there's a real number worth showing — an empty stat undercuts the
// point more than it helps.
export function AiResolvedStatCard() {
  const lang = useLanguage()
  const [count30d, setCount30d] = useState<number | null>(null)
  const [countAllTime, setCountAllTime] = useState<number | null>(null)

  useEffect(() => {
    const load = async () => {
      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const [{ count: c30 }, { count: cAll }] = await Promise.all([
        supabase.from('ai_troubleshoot_resolutions').select('id', { count: 'exact', head: true }).gte('created_at', since30d),
        supabase.from('ai_troubleshoot_resolutions').select('id', { count: 'exact', head: true }),
      ])
      setCount30d(c30 || 0)
      setCountAllTime(cAll || 0)
    }
    load()
  }, [])

  if (!count30d) return null

  return (
    <ScrollReveal className="bg-gradient-to-br from-[#0A7B7E]/15 to-[#12A5A9]/5 border border-[#12A5A9]/25 rounded-2xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-full px-2 py-0.5">✦ Prophandld AI</span>
      </div>
      <p className="text-white text-sm leading-relaxed">
        {t('aiResolvedStatLine', lang)
          .replace('{count}', String(count30d))}
      </p>
      {countAllTime !== null && countAllTime > count30d && (
        <p className="text-white/40 text-xs mt-1">{t('aiResolvedStatAllTime', lang).replace('{count}', String(countAllTime))}</p>
      )}
    </ScrollReveal>
  )
}
