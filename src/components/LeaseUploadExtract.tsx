'use client'

import { useRef, useState } from 'react'
import { useLanguage, t } from '@/lib/i18n'
import { RippleButton } from '@/components/RippleButton'

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
  late_fee_amount: number | null
  grace_period_days: number | null
  detected_unit_label: string | null
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

// Pulls out something like "B" from "Unit B" / "Apt 2B" / "#3" — the one
// piece of a label that actually distinguishes one unit from another on
// the same property. Returns null if neither label states a unit at all,
// which is treated as "nothing to compare" rather than a mismatch (a
// single-unit property's lease often never bothers naming one).
function unitToken(label: string | null | undefined): string | null {
  if (!label) return null
  const match = label.match(/\b(?:unit|apt\.?|apartment|#)\s*([a-z0-9]+)\b/i)
  return match ? match[1].toLowerCase() : null
}

// Only rendered when AI Assist is active on this landlord's account — see
// the parent form's own `aiAssistActive` check, mirroring how AiAssistCard
// hides itself when the status fetch says the account doesn't have access.
// Review-before-save stays with the form itself: this only ever calls
// onExtracted to merge fields into the form's existing state, the same
// Submit button the landlord already uses is still what actually saves.
export function LeaseUploadExtract({
  onExtracted,
  currentUnitLabel,
}: {
  onExtracted: (fields: TenancyExtraction) => void
  // e.g. "8058 Walker Street, Unit A" — the unit this upload is actually
  // happening on, so a lease that turns out to say "Unit B" can be
  // flagged instead of silently applied to the wrong unit's tenancy.
  currentUnitLabel?: string
}) {
  const lang = useLanguage()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'reading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [mismatch, setMismatch] = useState<{ detected: string; pending: TenancyExtraction } | null>(null)

  const applyResult = (extracted: TenancyExtraction) => {
    onExtracted(extracted)
    setStatus('done')
  }

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setStatus('reading')
    setError(null)
    setMismatch(null)
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
      const extracted: TenancyExtraction = data.extracted
      const detectedToken = unitToken(extracted.detected_unit_label)
      const currentToken = unitToken(currentUnitLabel)
      if (detectedToken && currentToken && detectedToken !== currentToken) {
        setMismatch({ detected: extracted.detected_unit_label!, pending: extracted })
        setStatus('idle')
        return
      }
      applyResult(extracted)
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

      {mismatch ? (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
          <p className="text-yellow-400 text-sm font-medium mb-1">{t('aiLeaseUploadUnitMismatchTitle', lang)}</p>
          <p className="text-white/70 text-xs mb-3">
            {t('aiLeaseUploadUnitMismatchBody', lang).replace('{detected}', mismatch.detected).replace('{current}', currentUnitLabel || '')}
          </p>
          <div className="flex items-center gap-3">
            <RippleButton
              onClick={() => {
                applyResult(mismatch.pending)
                setMismatch(null)
              }}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3.5 py-2 rounded-lg hover:opacity-90 transition"
            >
              {t('aiLeaseUploadUnitMismatchApply', lang)}
            </RippleButton>
            <button
              type="button"
              onClick={() => {
                setMismatch(null)
                setFileName(null)
              }}
              className="text-white/50 hover:text-white text-xs transition"
            >
              {t('cancel', lang)}
            </button>
          </div>
        </div>
      ) : (
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
      )}

      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      {status === 'done' && <p className="text-white/40 text-[11px] mt-2">{t('aiLeaseUploadReviewHint', lang)}</p>}
    </div>
  )
}
