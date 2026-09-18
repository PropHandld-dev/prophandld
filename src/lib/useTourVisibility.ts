'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Shows a role's tour every time someone signs in (tracked via a
// sessionStorage flag set at the moment of login/signup, consumed here
// so it doesn't re-fire on every refresh within the same session) —
// unless they've explicitly opted out forever (users.tour_opt_out).
// Can also be forced to replay via a ?tour=replay query param, used by
// the "Take the tour" link on the profile page. Reads location.search
// directly (rather than next/navigation's useSearchParams) so this
// doesn't force an otherwise-static dashboard page into dynamic
// rendering.
export function useTourVisibility(userId: string | null) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!userId) return

    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tour') === 'replay') {
      setShow(true)
      return
    }

    let justSignedIn = false
    try {
      justSignedIn = sessionStorage.getItem('ph_just_signed_in') === '1'
    } catch {}
    if (!justSignedIn) return

    supabase
      .from('users')
      .select('tour_opt_out')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('useTourVisibility: could not load tour state', error)
          return
        }
        if (!data?.tour_opt_out) setShow(true)
        try {
          sessionStorage.removeItem('ph_just_signed_in')
        } catch {}
      })
  }, [userId])

  const dismiss = () => {
    setShow(false)
  }

  const dismissForever = () => {
    setShow(false)
    if (userId) {
      supabase.from('users').update({ tour_opt_out: true }).eq('id', userId).then(({ error }) => {
        if (error) console.error('useTourVisibility: could not save opt-out', error)
      })
    }
  }

  return { show, dismiss, dismissForever }
}
