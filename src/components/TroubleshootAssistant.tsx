'use client'

import { useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t } from '@/lib/i18n'

type Phase = 'offer' | 'asking' | 'question' | 'checking' | 'result'

// Sits in place of the real Submit button until the renter either skips
// this, or the exchange concludes — onDone always fires exactly once, with
// a transcript to fold into the job description when the issue wasn't
// resolved (null when skipped entirely, so nothing extra gets appended).
type KnownAppliance = { name: string; brand: string | null; model: string | null }
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

// A photo is often far more useful than a typed description for this —
// "it's sparking" vs. an actual photo of the outlet. Capped at 2 so a
// renter who attached five photos and a video doesn't balloon the cost of
// one troubleshooting question; videos are skipped entirely (Claude's
// image input only).
async function encodeFirstPhotos(files: File[] | undefined, max = 2): Promise<{ base64: string; mediaType: string }[]> {
  const images = (files || []).filter((f) => IMAGE_MIME_TYPES.has(f.type)).slice(0, max)
  return Promise.all(
    images.map(
      (file) =>
        new Promise<{ base64: string; mediaType: string }>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve({ base64: (reader.result as string).split(',')[1] || '', mediaType: file.type })
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
    )
  )
}

export function TroubleshootAssistant({
  category,
  description,
  knownAppliance,
  photos,
  onDone,
}: {
  category: string
  description: string
  // The tracked system this job matches, if the landlord has it on file and
  // it's an unambiguous match — lets the one combined question skip asking
  // for brand/model it already knows instead of asking again.
  knownAppliance?: KnownAppliance | null
  // Whatever photos are already attached to the report at the point
  // troubleshooting runs — encoded on demand, only when actually needed,
  // not pre-encoded on every keystroke.
  photos?: File[]
  // 'resolved' means the renter confirmed it's fixed and explicitly chose
  // not to report it — the parent should stop here, not fall through to
  // showing a submit button for a report that isn't happening.
  onDone: (action: 'proceed' | 'resolved', transcript: string | null) => void
}) {
  const lang = useLanguage()
  const [phase, setPhase] = useState<Phase>('offer')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [resultMessage, setResultMessage] = useState('')
  const [resolved, setResolved] = useState(false)

  const start = async () => {
    setPhase('asking')
    try {
      const encodedPhotos = await encodeFirstPhotos(photos)
      const res = await fetch('/api/ai-assist/troubleshoot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, description, knownAppliance: knownAppliance || undefined, photos: encodedPhotos.length ? encodedPhotos : undefined }),
      })
      const data = await res.json()
      if (data.done) {
        if (!data.message) {
          // Nothing worth asking (emergency/excluded category/no useful
          // check) — skip straight through as if troubleshooting was never
          // offered at all.
          onDone('proceed', null)
          return
        }
        setResolved(!!data.resolved)
        setResultMessage(data.message)
        setPhase('result')
        return
      }
      setQuestion(data.question)
      setPhase('question')
    } catch {
      onDone('proceed', null)
    }
  }

  const submitAnswer = async () => {
    setPhase('checking')
    try {
      // Each call is stateless (no server-side memory of the first pass),
      // so the photos have to be sent again here for the DIY-tips pass to
      // also have visual context, not just the text answer.
      const encodedPhotos = await encodeFirstPhotos(photos)
      const res = await fetch('/api/ai-assist/troubleshoot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          description,
          knownAppliance: knownAppliance || undefined,
          photos: encodedPhotos.length ? encodedPhotos : undefined,
          previousQuestion: question,
          previousAnswer: answer,
        }),
      })
      const data = await res.json()
      setResolved(!!data.resolved)
      setResultMessage(data.message || '')
      setPhase('result')
    } catch {
      onDone('proceed', `AI troubleshooting question: ${question}\nRenter's answer: ${answer}`)
    }
  }

  const transcript = question ? `AI troubleshooting question: ${question}\nRenter's answer: ${answer}` : null

  if (phase === 'offer') {
    return (
      <div className="bg-[#12A5A9]/8 border border-[#12A5A9]/25 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-full px-2 py-0.5">✦ AI</span>
        </div>
        <p className="text-white/70 text-sm mb-3">{t('troubleshootOfferText', lang)}</p>
        <div className="flex items-center gap-3">
          <RippleButton
            onClick={start}
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition"
          >
            {t('troubleshootTryBtn', lang)}
          </RippleButton>
          <button type="button" onClick={() => onDone('proceed', null)} className="text-white/50 text-sm hover:text-white transition">
            {t('troubleshootSkipBtn', lang)}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'asking') {
    return <div className="bg-white/3 border border-white/8 rounded-2xl p-4 text-white/50 text-sm">{t('troubleshootThinking', lang)}</div>
  }

  if (phase === 'question') {
    return (
      <div className="bg-[#12A5A9]/8 border border-[#12A5A9]/25 rounded-2xl p-4">
        <p className="text-white text-sm mb-3">{question}</p>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={2}
          placeholder={t('troubleshootAnswerPlaceholder', lang)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition resize-none mb-3"
        />
        <div className="flex items-center gap-3">
          <RippleButton
            onClick={submitAnswer}
            disabled={!answer.trim()}
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition disabled:opacity-50"
          >
            {t('troubleshootContinueBtn', lang)}
          </RippleButton>
          <button type="button" onClick={() => onDone('proceed', transcript)} className="text-white/50 text-sm hover:text-white transition">
            {t('troubleshootSkipBtn', lang)}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'checking') {
    return <div className="bg-white/3 border border-white/8 rounded-2xl p-4 text-white/50 text-sm">{t('troubleshootThinking', lang)}</div>
  }

  // result
  return (
    <div className={`rounded-2xl p-4 border ${resolved ? 'bg-[#12A5A9]/8 border-[#12A5A9]/25' : 'bg-white/3 border-white/8'}`}>
      <p className="text-white text-sm mb-3">{resultMessage}</p>
      {resolved ? (
        <div className="flex items-center gap-3">
          <RippleButton
            onClick={() => onDone('resolved', null)}
            className="bg-white/8 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-white/12 transition"
          >
            {t('troubleshootAllSetBtn', lang)}
          </RippleButton>
          <button type="button" onClick={() => onDone('proceed', transcript)} className="text-[#12A5A9] text-sm hover:underline transition">
            {t('troubleshootStillReportBtn', lang)}
          </button>
        </div>
      ) : (
        <RippleButton
          onClick={() => onDone('proceed', transcript)}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition"
        >
          {t('troubleshootPostJobBtn', lang)}
        </RippleButton>
      )}
    </div>
  )
}
