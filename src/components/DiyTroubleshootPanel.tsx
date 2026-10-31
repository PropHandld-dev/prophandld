'use client'

import { useEffect, useRef, useState } from 'react'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t } from '@/lib/i18n'

type KnownAppliance = { name: string; brand: string | null; model: string | null }
type Turn = { role: 'user' | 'assistant'; content: string; resolved?: boolean }
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
// same API route, same open-ended chat (not a fixed one-question wizard),
// same safety rules, just no "proceed to submitting a report" exit path,
// since the landlord already has the job open in front of them. Purely
// informational: a landlord who's decided to "Handle it myself" can
// optionally keep chatting with AI before/while they work, then use the
// existing before/after photo + cost fields regardless of what it says.
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

  const getEncodedPhotos = async () => {
    if (encodedPhotosRef.current === null) {
      encodedPhotosRef.current = await encodePhotoUrls(photoUrls || [])
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
        setTurns((prev) => [...prev, ...(userMessage ? [{ role: 'user' as const, content: userMessage }] : []), { role: 'assistant' as const, content: t('diyAiNoSuggestions', lang) }])
        setSending(false)
        return
      }
      setTurns((prev) => [...prev, ...(userMessage ? [{ role: 'user' as const, content: userMessage }] : []), { role: 'assistant' as const, content: data.reply, resolved: !!data.resolved }])
    } catch {
      setTurns((prev) => [...prev, ...(userMessage ? [{ role: 'user' as const, content: userMessage }] : []), { role: 'assistant' as const, content: t('diyAiNoSuggestions', lang) }])
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

  if (!started) {
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

  return (
    <div className="bg-[#12A5A9]/8 border border-[#12A5A9]/25 rounded-xl p-3 mb-4">
      {photosUsed > 0 && (
        <p className="text-[#12A5A9]/70 text-[11px] mb-2">✦ {t('aiReviewedPhotoNote', lang)}</p>
      )}
      <div ref={listRef} className="max-h-56 overflow-y-auto space-y-2 mb-2.5">
        {turns.map((turn, i) => (
          <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={
                turn.role === 'user'
                  ? 'max-w-[85%] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white rounded-xl rounded-br-sm px-3 py-1.5 text-xs'
                  : 'max-w-[85%] bg-white/5 border border-white/10 text-white/80 rounded-xl rounded-bl-sm px-3 py-1.5 text-xs'
              }
            >
              <p className="leading-relaxed whitespace-pre-wrap break-words">{turn.content}</p>
            </div>
          </div>
        ))}
        {sending && <p className="text-white/40 text-xs">{t('troubleshootThinking', lang)}</p>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={t('troubleshootAnswerPlaceholder', lang)}
          disabled={sending}
          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition disabled:opacity-50"
        />
        <RippleButton
          onClick={sendMessage}
          disabled={sending || !draft.trim()}
          className="shrink-0 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
        >
          {t('troubleshootContinueBtn', lang)}
        </RippleButton>
      </div>
    </div>
  )
}
