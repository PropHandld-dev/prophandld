'use client'

import { useLanguage, t } from '@/lib/i18n'
import { CheckCircleIcon } from '@/components/icons'

// The small line under an auto-saved form: "Restored your unsaved draft ·
// Discard" right after coming back, then a quiet "Draft saved" while typing.
export function DraftNote({ restored, savedAt, onDiscard, className = '' }: { restored: boolean; savedAt: number | null; onDiscard: () => void; className?: string }) {
  const lang = useLanguage()
  if (restored) {
    return (
      <div className={`flex items-center justify-between gap-3 bg-[#12A5A9]/8 border border-[#12A5A9]/25 rounded-xl px-4 py-2.5 ${className}`} role="status">
        <p className="text-[#12A5A9] text-sm">{t('draftRestored', lang)}</p>
        <button type="button" onClick={onDiscard} className="text-white/60 hover:text-white text-xs font-medium underline shrink-0">
          {t('discardDraftBtn', lang)}
        </button>
      </div>
    )
  }
  if (!savedAt) return null
  return (
    <p className={`flex items-center gap-1.5 text-white/40 text-xs ${className}`} role="status" aria-live="polite">
      <CheckCircleIcon className="w-3.5 h-3.5" /> {t('draftSavedJustNow', lang)}
    </p>
  )
}
