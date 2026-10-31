'use client'

import { useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t } from '@/lib/i18n'

type Phase = 'idle' | 'asking' | 'question' | 'checking' | 'result'
type KnownAppliance = { name: string; brand: string | null; model: string | null }
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

// Same idea as TroubleshootAssistant's encodeFirstPhotos, starting from
// signed storage URLs instead of in-browser File objects — the job's
// reported photos already live in Supabase storage by the time a landlord
// is looking at an existing job, not as File objects to re-encode. Capped
// at 2, silently skips anything that fails to fetch or isn't a real image
// (a video, an expired signed URL) rather than blocking the suggestion.
async function encodePhotoUrls(urls: string[], max = 2): Promise<{ base64: string; mediaType: string }[]> {
  const results = await Promise.all(
    urls.slice(0, max).map(async (url) => {
      try {
        const blob = await (await fetch(url)).blob()
        if (!IMAGE_MIME_TYPES.has(blob.type)) return null
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(',')[1] || '')
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
        return { base64, mediaType: blob.type }
      } catch {
        return null
      }
    })
  )
  return results.filter((r): r is { base64: string; mediaType: string } => !!r)
}

// The landlord-side counterpart to TroubleshootAssistant (renter/report) —
// same API route, same safety rules, same disclaimers, just no "proceed to
// submitting a report" exit path, since the landlord already has the job
// open in front of them. Purely informational: a landlord who's decided to
// "Handle it myself" can optionally see what AI would suggest before they
// start, then use the existing before/after photo + cost fields regardless
// of what it says.
export function DiyTroubleshootPanel({
  category,
  description,
  knownAppliance,
  photoUrls,
}: {
  category: string
  description: string
  knownAppliance?: KnownAppliance | null
  // The job's own reported photo URLs (signed, from Supabase storage) —
  // optional, since not every job has photos attached.
  photoUrls?: string[]
}) {
  const lang = useLanguage()
  const [phase, setPhase] = useState<Phase>('idle')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [resultMessage, setResultMessage] = useState('')

  const start = async () => {
    setPhase('asking')
    try {
      const photos = await encodePhotoUrls(photoUrls || [])
      const res = await fetch('/api/ai-assist/troubleshoot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, description, knownAppliance: knownAppliance || undefined, photos: photos.length ? photos : undefined }),
      })
      const data = await res.json()
      if (data.done) {
        setResultMessage(data.message || t('diyAiNoSuggestions', lang))
        setPhase('result')
        return
      }
      setQuestion(data.question)
      setPhase('question')
    } catch {
      setResultMessage(t('diyAiNoSuggestions', lang))
      setPhase('result')
    }
  }

  const submitAnswer = async () => {
    setPhase('checking')
    try {
      const photos = await encodePhotoUrls(photoUrls || [])
      const res = await fetch('/api/ai-assist/troubleshoot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          description,
          knownAppliance: knownAppliance || undefined,
          photos: photos.length ? photos : undefined,
          previousQuestion: question,
          previousAnswer: answer,
        }),
      })
      const data = await res.json()
      setResultMessage(data.message || t('diyAiNoSuggestions', lang))
      setPhase('result')
    } catch {
      setResultMessage(t('diyAiNoSuggestions', lang))
      setPhase('result')
    }
  }

  if (phase === 'idle') {
    return (
      <button
        type="button"
        onClick={start}
        className="w-full flex items-center justify-center gap-1.5 bg-[#12A5A9]/8 border border-[#12A5A9]/25 text-[#12A5A9] text-xs font-semibold py-2.5 rounded-xl hover:bg-[#12A5A9]/12 transition mb-4"
      >
        ✦ {t('diyAiSuggestBtn', lang)}
      </button>
    )
  }

  if (phase === 'asking' || phase === 'checking') {
    return (
      <div className="bg-white/3 border border-white/8 rounded-xl p-3 text-white/50 text-xs mb-4">{t('troubleshootThinking', lang)}</div>
    )
  }

  if (phase === 'question') {
    return (
      <div className="bg-[#12A5A9]/8 border border-[#12A5A9]/25 rounded-xl p-3 mb-4">
        <p className="text-white text-xs mb-2">{question}</p>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={2}
          placeholder={t('troubleshootAnswerPlaceholder', lang)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition resize-none mb-2"
        />
        <RippleButton
          onClick={submitAnswer}
          disabled={!answer.trim()}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
        >
          {t('troubleshootContinueBtn', lang)}
        </RippleButton>
      </div>
    )
  }

  // result
  return (
    <div className="bg-white/3 border border-white/8 rounded-xl p-3 mb-4">
      <span className="text-[10px] font-bold uppercase tracking-wide text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-full px-2 py-0.5 inline-block mb-2">✦ AI</span>
      <p className="text-white/80 text-xs leading-relaxed">{resultMessage}</p>
    </div>
  )
}
