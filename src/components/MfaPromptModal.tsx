'use client'

import { useRouter } from 'next/navigation'
import { ShieldIcon } from '@/components/icons'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t } from '@/lib/i18n'

// Shown once, right after a brand-new signup (see useMfaPromptVisibility)
// — skippable, never blocks getting into the app. "Set up now" sends them
// to Profile's existing TwoFactorAuthCard rather than duplicating that
// enrollment flow here.
export function MfaPromptModal({ onDismiss }: { onDismiss: () => void }) {
  const lang = useLanguage()
  const router = useRouter()

  const handleSetUpNow = () => {
    onDismiss()
    router.push('/profile#two-factor')
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-[#0F2138] border border-white/10 rounded-2xl p-6 max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-full bg-[#0A7B7E]/20 flex items-center justify-center mx-auto mb-4">
          <ShieldIcon className="w-6 h-6 text-[#12A5A9]" />
        </div>
        <h3 className="text-white font-bold text-lg mb-2">{t('mfaPromptHeading', lang)}</h3>
        <p className="text-white/60 text-sm mb-6">{t('mfaPromptBody', lang)}</p>
        <div className="flex flex-col gap-2">
          <RippleButton
            onClick={handleSetUpNow}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl hover:opacity-90 transition"
          >
            {t('mfaPromptSetUpNow', lang)}
          </RippleButton>
          <button onClick={onDismiss} className="text-white/50 hover:text-white text-sm py-2 transition">
            {t('mfaPromptMaybeLater', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
