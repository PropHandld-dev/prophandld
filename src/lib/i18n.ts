'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type Lang = 'en' | 'es'

// Reads the real, already-saved preference (Profile → Preferred language)
// instead of showing both languages at once — a genuine switch, not the
// dual-display fallback used before there was a real preference to read.
// Starts 'en' and updates once the account loads, same tradeoff every
// other per-viewer personalization in this app already makes.
export function useLanguage(): Lang {
  const [lang, setLang] = useState<Lang>('en')
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return
      if (user?.user_metadata?.preferred_language === 'es') setLang('es')
    })
    return () => {
      cancelled = true
    }
  }, [])
  return lang
}

// One dictionary, one key per translated string, grouped loosely by where
// it's used. Add a key here and call t(key, lang) rather than hand-rolling
// another bilingual line — keeps every translation reviewable in one file
// instead of scattered through JSX.
const STRINGS = {
  // Report an issue (renter)
  reportTitle: { en: 'Report an issue', es: 'Reportar un problema' },
  reportSubtitle: {
    en: "Let your landlord know what's going on. Add photos or a short video if you can, it helps get the right contractor.",
    es: 'Avísale a tu propietario lo que está pasando. Agrega fotos o un video corto si puedes, ayuda a conseguir al contratista correcto.',
  },
  category: { en: 'Category', es: 'Categoría' },
  description: { en: 'Description', es: 'Descripción' },
  descriptionPlaceholder: { en: "What's going on? Be as specific as you can.", es: '¿Qué está pasando? Sea lo más específico posible.' },
  thisIsEmergency: { en: 'This is an emergency', es: 'Esto es una emergencia' },
  emergencyExplain: {
    en: 'Only use this for issues that need attention right away: active leaks, gas smells, no heat, broken locks.',
    es: 'Use esto solo para problemas urgentes: fugas de agua, olor a gas, sin calefacción, cerraduras rotas.',
  },
  markAsEmergency: { en: 'Mark as emergency', es: 'Marcar como emergencia' },
  marked: { en: 'Marked ✓', es: 'Marcado ✓' },
  submitReport: { en: 'Submit report', es: 'Enviar reporte' },
  submitting: { en: 'Submitting...', es: 'Enviando...' },
} satisfies Record<string, Record<Lang, string>>

export function t(key: keyof typeof STRINGS, lang: Lang): string {
  return STRINGS[key][lang]
}
