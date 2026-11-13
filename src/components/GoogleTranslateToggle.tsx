'use client'

import { useEffect, useState } from 'react'
import { GlobeIcon } from '@/components/icons'

const COOKIE_NAME = 'googtrans'

// Stop-gap for the PM dashboard specifically (not wired into the app's
// own i18n.ts system yet, unlike every other authenticated page) --
// rides on Google's legacy, unofficial "Website Translator" widget via
// its documented cookie trick (set googtrans=/en/es, reload) rather than
// its own UI, since that widget's default banner doesn't match this
// app's look. Known tradeoffs, accepted deliberately rather than
// overlooked: machine translation of domain terms ("bid", "threshold",
// "approval") won't always match the hand-written Spanish used
// elsewhere in the app, and Google could change or drop this widget
// without notice -- it's explicitly unofficial, not a supported API.
// Scoped to just this page's own mount, not the root layout, so it
// doesn't also start re-translating pages that already have real,
// reviewed Spanish through t().
export function GoogleTranslateToggle() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    setActive(document.cookie.includes(`${COOKIE_NAME}=/en/es`))
  }, [])

  useEffect(() => {
    if (document.getElementById('google_translate_element')) return
    const mount = document.createElement('div')
    mount.id = 'google_translate_element'
    mount.style.display = 'none'
    document.body.appendChild(mount)

    ;(window as any).googleTranslateElementInit = () => {
      const google = (window as any).google
      if (google?.translate?.TranslateElement) {
        new google.translate.TranslateElement(
          { pageLanguage: 'en', includedLanguages: 'es', autoDisplay: false },
          'google_translate_element'
        )
      }
    }
    const script = document.createElement('script')
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'
    document.body.appendChild(script)
  }, [])

  const toggle = () => {
    const next = !active
    const value = next ? '/en/es' : '/en/en'
    // Both cookie forms needed in practice: some browsers only honor the
    // one scoped to the current host, others need the bare path=/ form.
    document.cookie = `${COOKIE_NAME}=${value};path=/`
    document.cookie = `${COOKIE_NAME}=${value};path=/;domain=.${window.location.hostname}`
    window.location.reload()
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-1.5 text-white/50 hover:text-white text-xs font-semibold transition"
    >
      <GlobeIcon className="w-3.5 h-3.5" />
      {active ? 'View in English' : 'Ver en español'}
    </button>
  )
}
