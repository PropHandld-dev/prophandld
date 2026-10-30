'use client'

import { useRef, useState } from 'react'
import { useLanguage, t } from '@/lib/i18n'

type TenancyExtraction = {
  rent_amount: number | null
  rent_due_day: number | null
  lease_start: string | null
  lease_end: string | null
  security_deposit: number | null
  escalation_percent: number | null
  escalation_frequency_months: number | null
  occupants: number | null
  pets: string | null
}

const ACCEPTED = 'application/pdf,image/jpeg,image/png'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // "data:application/pdf;base64,JVBERi0x..." — Claude's API wants the
      // raw base64 payload only, not the data URL prefix.
      resolve(result.split(',')[1] || '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Only rendered when AI Assist is active on this landlord's account — see
// the parent form's own `aiAssistActive` check, mirroring how AiAssistCard
// hides itself when the status fetch says the account doesn't have access.
// Review-before-save stays with the form itself: this only ever calls
// onExtracted to merge fields into the form's existing state, the same
// Submit button the landlord already uses is still what actually saves.
export function LeaseUploadExtract({ onExtracted }: { onExtracted: (fields: TenancyExtraction) => void }) {
  const lang = useLanguage()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'reading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setStatus('reading')
    setError(null)
    try {
      const mediaType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '')
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(mediaType)) {
        setError(t('aiLeaseUploadWrongType', lang))
        setStatus('error')
        return
      }
      const fileBase64 = await fileToBase64(file)
      const res = await fetch('/api/ai-assist/extract/tenancy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64, mediaType }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('aiLeaseUploadFailed', lang))
        setStatus('error')
        return
      }
      onExtracted(data.extracted)
      setStatus('done')
    } catch {
      setError(t('aiLeaseUploadFailed', lang))
      setStatus('error')
    }
  }

  return (
    <div className="bg-white/3 border border-[#12A5A9]/25 rounded-2xl p-4 mb-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-full px-2 py-0.5">
          ✦ {t('aiAssistCardTitle', lang)}
        </span>
      </div>
      <p className="text-white/60 text-xs mb-3">{t('aiLeaseUploadPrompt', lang)}</p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === 'reading'}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-left text-sm text-white/80 hover:bg-white/8 transition disabled:opacity-60 flex items-center gap-3"
      >
        <span className="text-lg">📄</span>
        <span className="flex-1 truncate">
          {fileName ? fileName : t('aiLeaseUploadCta', lang)}
        </span>
        {status === 'reading' && <span className="text-[#12A5A9] text-xs shrink-0">{t('aiLeaseUploadReading', lang)}</span>}
        {status === 'done' && <span className="text-[#12A5A9] text-xs shrink-0">✓ {t('aiLeaseUploadDone', lang)}</span>}
      </button>

      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      {status === 'done' && <p className="text-white/40 text-[11px] mt-2">{t('aiLeaseUploadReviewHint', lang)}</p>}
    </div>
  )
}
