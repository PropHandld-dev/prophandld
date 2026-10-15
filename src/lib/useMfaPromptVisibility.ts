'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Offers 2FA once, right after a brand-new signup (not every sign-in —
// that's what ph_just_signed_in / useTourVisibility is for). Tracked via
// its own sessionStorage flag set only in signup/page.tsx's direct-signup
// paths, consumed here the same way the tour hook consumes its own flag,
// so the two don't collide over the same key. Callers are expected to
// gate rendering on their own tour's dismissed state (e.g. `!tour.show &&
// mfaPrompt.show`) so the two first-run prompts never stack on screen at
// once.
export function useMfaPromptVisibility(userId: string | null) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!userId) return

    let justSignedUp = false
    try {
      justSignedUp = sessionStorage.getItem('ph_just_signed_up') === '1'
    } catch {}
    if (!justSignedUp) return

    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      try {
        sessionStorage.removeItem('ph_just_signed_up')
      } catch {}
      if (error) return
      const alreadyEnrolled = data?.totp?.some((f) => f.status === 'verified')
      if (!alreadyEnrolled) setShow(true)
    })
  }, [userId])

  const dismiss = () => setShow(false)

  return { show, dismiss }
}
