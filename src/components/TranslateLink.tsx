'use client'

import { useState } from 'react'
import { useLanguage } from '@/lib/i18n'

// "Translate" under someone else's message: shows it in the reader's app
// language (English or Spanish), right below the original.
export function TranslateLink({ text, className = '' }: { text: string; className?: string }) {
  const lang = useLanguage()
  const [translated, setTranslated] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!text || text.trim().length < 2) return null
  const run = async () => {
    if (translated) {
      setTranslated(null)
      return
    }
    setBusy(true)
    setFailed(false)
    const res = await fetch('/api/ai-assist/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, to: lang === 'es' ? 'es' : 'en' }) }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok || !d.text) setFailed(true)
    else setTranslated(d.text)
  }
  return (
    <div className={className}>
      {translated && <p className="text-white/80 text-sm whitespace-pre-line border-l-2 border-[#12A5A9]/50 pl-2.5 my-1">{translated}</p>}
      <button type="button" onClick={run} disabled={busy} className="text-[11px] text-[#12A5A9]/80 hover:text-[#12A5A9] font-semibold disabled:opacity-50">
        {busy ? (lang === 'es' ? 'Traduciendo…' : 'Translating…') : translated ? (lang === 'es' ? 'Ver original' : 'Show original only') : failed ? (lang === 'es' ? 'Reintentar traducción' : 'Try translating again') : lang === 'es' ? 'Traducir' : 'Translate'}
      </button>
    </div>
  )
}
