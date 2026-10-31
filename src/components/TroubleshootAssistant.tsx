'use client'

import { useEffect, useRef, useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t } from '@/lib/i18n'

type KnownAppliance = { name: string; brand: string | null; model: string | null }
type Turn = { role: 'user' | 'assistant'; content: string; resolved?: boolean }
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

// A photo is often far more useful than a typed description for this —
// "it's sparking" vs. an actual photo of the outlet. Capped at 2 so a
// renter who attached five photos and a video doesn't balloon the cost of
// every turn; videos are skipped entirely (Claude's image input only).
// Encoded once and cached, not re-read from the File objects on every
// message in a multi-turn conversation.
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

// An open-ended chat, not a fixed one-question-then-done wizard — stays in
// the conversation for as many turns as the renter keeps responding,
// exactly like talking to an actual AI assistant, with "report it now"
// always sitting right there so nothing ever traps them in it.
// onDone fires exactly once, with a transcript of the whole exchange to
// fold into the job description when the issue wasn't resolved (null when
// skipped entirely at the very first offer, so nothing extra gets added).
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
  // it's an unambiguous match — lets the AI skip asking for brand/model it
  // already knows instead of asking again.
  knownAppliance?: KnownAppliance | null
  // Whatever photos are already attached to the report at the point
  // troubleshooting starts.
  photos?: File[]
  // 'resolved' means the renter confirmed it's fixed and explicitly chose
  // not to report it — the parent should stop here, not fall through to
  // showing a submit button for a report that isn't happening.
  onDone: (action: 'proceed' | 'resolved', transcript: string | null) => void
}) {
  const lang = useLanguage()
  const [started, setStarted] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [photosUsed, setPhotosUsed] = useState(0)
  const encodedPhotosRef = useRef<{ base64: string; mediaType: string }[] | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns.length, sending])

  const transcriptFor = (allTurns: Turn[]) =>
    allTurns.length ? `AI troubleshooting conversation:\n${allTurns.map((t) => `${t.role === 'user' ? 'Renter' : 'Assistant'}: ${t.content}`).join('\n')}` : null

  const getEncodedPhotos = async () => {
    if (encodedPhotosRef.current === null) {
      encodedPhotosRef.current = await encodeFirstPhotos(photos)
    }
    return encodedPhotosRef.current
  }

  const send = async (history: Turn[], userMessage?: string) => {
    setSending(true)
    try {
      const encodedPhotos = await getEncodedPhotos()
      setPhotosUsed(encodedPhotos.length)
      const res = await fetch('/api/ai-assist/troubleshoot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          description,
          knownAppliance: knownAppliance || undefined,
          photos: encodedPhotos.length ? encodedPhotos : undefined,
          history: history.map((h) => ({ role: h.role, content: h.content })),
          message: userMessage,
        }),
      })
      const data = await res.json()
      if (!data.reply) {
        // Nothing worth asking (emergency/excluded category/no AI Assist/
        // rate-limited) — only meaningful on the very first call; skip
        // straight through as if troubleshooting was never offered.
        if (history.length === 0) {
          onDone('proceed', null)
          return
        }
        setSending(false)
        return
      }
      setTurns((prev) => [...prev, ...(userMessage ? [{ role: 'user' as const, content: userMessage }] : []), { role: 'assistant' as const, content: data.reply, resolved: !!data.resolved }])
    } catch {
      if (history.length === 0) {
        onDone('proceed', null)
        return
      }
      setTurns((prev) => [...prev, ...(userMessage ? [{ role: 'user' as const, content: userMessage }] : [])])
    }
    setSending(false)
  }

  const start = () => {
    setStarted(true)
    send([])
  }

  const sendMessage = () => {
    const message = draft.trim()
    if (!message || sending) return
    setDraft('')
    send(turns, message)
  }

  const lastTurn = turns[turns.length - 1]
  const justResolved = lastTurn?.role === 'assistant' && lastTurn.resolved

  if (!started) {
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

  return (
    <div className="bg-[#12A5A9]/8 border border-[#12A5A9]/25 rounded-2xl p-4">
      {photosUsed > 0 && (
        <p className="text-[#12A5A9]/70 text-[11px] mb-2">✦ {t('aiReviewedPhotoNote', lang)}</p>
      )}
      <div ref={listRef} className="max-h-72 overflow-y-auto space-y-2.5 mb-3">
        {turns.map((turn, i) => (
          <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={
                turn.role === 'user'
                  ? 'max-w-[85%] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white rounded-2xl rounded-br-sm px-3.5 py-2 text-sm'
                  : 'max-w-[85%] bg-white/5 border border-white/10 text-white rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm'
              }
            >
              <p className="leading-relaxed whitespace-pre-wrap break-words">{turn.content}</p>
            </div>
          </div>
        ))}
        {sending && <p className="text-white/40 text-xs">{t('troubleshootThinking', lang)}</p>}
      </div>

      {justResolved && (
        <div className="flex items-center gap-3 mb-3">
          <RippleButton
            onClick={() => onDone('resolved', null)}
            className="bg-white/8 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-white/12 transition"
          >
            {t('troubleshootAllSetBtn', lang)}
          </RippleButton>
          <button type="button" onClick={() => onDone('proceed', transcriptFor(turns))} className="text-[#12A5A9] text-xs hover:underline transition">
            {t('troubleshootStillReportBtn', lang)}
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={t('troubleshootAnswerPlaceholder', lang)}
          disabled={sending}
          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition disabled:opacity-50"
        />
        <RippleButton
          onClick={sendMessage}
          disabled={sending || !draft.trim()}
          className="shrink-0 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
        >
          {t('troubleshootContinueBtn', lang)}
        </RippleButton>
      </div>
      <button
        type="button"
        onClick={() => onDone('proceed', transcriptFor(turns))}
        className="text-white/40 hover:text-white/70 text-xs mt-2.5 transition"
      >
        {t('troubleshootPostJobBtn', lang)}
      </button>
    </div>
  )
}
