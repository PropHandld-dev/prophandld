'use client'

import { useLanguage, t } from '@/lib/i18n'

// What a screen or card shows when its data didn't load. Never a fake "$0",
// "Not set up" or a blank editable form: those look like real answers, and
// a blank form saved on top of a failed read can erase what was there.
export function LoadFailed({ onRetry, what, className = '' }: { onRetry: () => void; what?: string; className?: string }) {
  const lang = useLanguage()
  return (
    <div role="alert" className={`bg-white/3 border border-white/10 rounded-2xl p-5 flex items-start gap-3 ${className}`}>
      <span className="w-8 h-8 rounded-full bg-amber-400/12 text-amber-300 grid place-items-center shrink-0 text-sm font-bold" aria-hidden="true">!</span>
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-semibold">{what ? t('loadFailedWhat', lang).replace('{what}', what) : t('loadFailedTitle', lang)}</p>
        <p className="text-white/55 text-sm mt-0.5">{t('loadFailedBody', lang)}</p>
        <button type="button" onClick={onRetry} className="mt-3 text-sm font-semibold text-[#12A5A9] hover:underline">
          {t('todayRetry', lang)}
        </button>
      </div>
    </div>
  )
}
