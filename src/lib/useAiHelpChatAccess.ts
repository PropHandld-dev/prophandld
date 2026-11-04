'use client'

import { useEffect, useState } from 'react'
import { AI_ASSIST_ENABLED } from '@/lib/aiAssist'

// The in-app AI help chat used to be free for every signed-in user
// regardless of billing — product decision reversed (2026-11-04): it's
// now part of Prophandld AI, the landlord-paid add-on, same as lease Q&A
// and the rest. Contractors never got Prophandld AI's features anywhere
// else in the app, so they don't get this either. `null` while loading —
// callers should treat that as "don't know yet," not "no access."
export function useAiHelpChatAccess(role: 'landlord' | 'renter' | 'contractor' | null): boolean | null {
  const [access, setAccess] = useState<boolean | null>(null)

  useEffect(() => {
    if (!AI_ASSIST_ENABLED || !role || role === 'contractor') {
      setAccess(false)
      return
    }
    setAccess(null)
    const url = role === 'landlord' ? '/api/ai-assist/status' : '/api/ai-assist/renter-status'
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (role === 'landlord') {
          setAccess(!!data.enabled && (data.status === 'trialing' || data.status === 'active'))
        } else {
          setAccess(!!data.available)
        }
      })
      .catch(() => setAccess(false))
  }, [role])

  return access
}
