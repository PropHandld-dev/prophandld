'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Auto-shows a role's tour once per account (tracked in users.onboarding_tour_seen),
// and can be forced to replay via a ?tour=replay query param — used by the
// "Take the tour" link on the profile page. Reads location.search directly
// (rather than next/navigation's useSearchParams) so this doesn't force an
// otherwise-static dashboard page into dynamic rendering.
export function useTourVisibility(userId: string | null) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!userId) return
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tour') === 'replay') {
      setShow(true)
      return
    }
    supabase
      .from('users')
      .select('onboarding_tour_seen')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('useTourVisibility: could not load tour state', error)
          return
        }
        if (data && !data.onboarding_tour_seen) setShow(true)
      })
  }, [userId])

  const dismiss = () => {
    setShow(false)
    if (userId) {
      supabase.from('users').update({ onboarding_tour_seen: true }).eq('id', userId).then(({ error }) => {
        if (error) console.error('useTourVisibility: could not save tour state', error)
      })
    }
  }

  return { show, dismiss }
}
