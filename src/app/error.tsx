'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t } from '@/lib/i18n'

// The route-level error boundary Next.js checks first, for any client-side
// exception thrown while rendering a page — this app had none at all before
// this, meaning every unexpected error anywhere, on any action, fell all
// the way through to global-error.tsx: a bare, unstyled Sentry-boilerplate
// page whose only content is effectively "check the browser console". That
// generic fallback stays in place as the true last resort (an error in the
// root layout itself, which this can't catch), but this is what actually
// catches the overwhelming majority of real crashes now, and shows
// something a person can act on instead.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const lang = useLanguage()

  useEffect(() => {
    Sentry.captureException(error)
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-white text-xl font-bold mb-2">{t('somethingWentWrongHeading', lang)}</h1>
        <p className="text-white/60 text-sm mb-6">{t('errorBoundaryDesc', lang)}</p>
        <div className="flex items-center justify-center gap-4">
          <RippleButton
            onClick={() => reset()}
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition"
          >
            {t('tryAgainBtn', lang)}
          </RippleButton>
          <Link href="/" className="text-white/60 hover:text-white text-sm transition">
            {t('goHomeBtn', lang)}
          </Link>
        </div>
      </div>
    </div>
  )
}
