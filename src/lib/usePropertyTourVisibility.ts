'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Unlike the dashboard tour (which re-shows every sign-in), this one is a
// single-page walkthrough for a page you visit constantly within a
// session — showing it every visit would be exhausting, so it's once
// ever per account (tracked via users.property_tour_seen), replayable
// via a ?tour=replay query param the same way. Fails open on a lookup
// error (e.g. the column not existing yet) rather than silently never
// showing.
export function usePropertyTourVisibility(userId: string | null) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!userId) return

    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tour') === 'replay') {
      setShow(true)
      return
    }

    supabase
      .from('users')
      .select('property_tour_seen')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('usePropertyTourVisibility: could not load tour state — showing the tour anyway', error)
          setShow(true)
          return
        }
        if (!data?.property_tour_seen) setShow(true)
      })
  }, [userId])

  const dismiss = () => {
    setShow(false)
    if (userId) {
      supabase.from('users').update({ property_tour_seen: true }).eq('id', userId).then(({ error }) => {
        if (error) console.error('usePropertyTourVisibility: could not save seen state', error)
      })
    }
  }

  return { show, dismiss }
}
