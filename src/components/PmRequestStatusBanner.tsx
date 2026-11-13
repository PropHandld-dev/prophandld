'use client'

import { useEffect, useState } from 'react'
import { CheckCircleIcon, AlertTriangleIcon } from '@/components/icons'

// A logged-out visitor who clicked "Request to be managed by [PM]" on a
// public PM profile is sent to signup, and the actual /api/pm/clients/request
// call only fires on their first real login afterward (see login/page.tsx --
// no session exists yet at signup time). That call used to be pure
// fire-and-forget (console.error only), so someone who signed up
// specifically to reach a PM had no way to know whether the request that
// motivated the signup ever actually went through. Reads window.location
// directly (not useSearchParams) so this never needs a Suspense boundary on
// the page-level client components that render it.
export function PmRequestStatusBanner() {
  const [status, setStatus] = useState<'sent' | 'failed' | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sent = params.get('pmRequestSent') === '1'
    const failed = params.get('pmRequestFailed') === '1'
    if (!sent && !failed) return

    setStatus(sent ? 'sent' : 'failed')
    params.delete('pmRequestSent')
    params.delete('pmRequestFailed')
    const rest = params.toString()
    window.history.replaceState({}, '', rest ? `${window.location.pathname}?${rest}` : window.location.pathname)

    const timer = setTimeout(() => setStatus(null), 6000)
    return () => clearTimeout(timer)
  }, [])

  if (!status) return null

  if (status === 'sent') {
    return (
      <div className="flex items-center gap-2 bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-4 py-3 mb-6 motion-safe:animate-[fadeIn_0.2s_ease-out]">
        <CheckCircleIcon className="w-4 h-4 text-[#12A5A9] shrink-0" />
        <span className="text-[#12A5A9] text-sm font-medium">
          Your request to be managed was sent. They can accept it from their dashboard.
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-6 motion-safe:animate-[fadeIn_0.2s_ease-out]">
      <AlertTriangleIcon className="w-4 h-4 text-red-400 shrink-0" />
      <span className="text-red-300 text-sm font-medium">
        We couldn&apos;t send your property manager request. Try it again from their profile page.
      </span>
    </div>
  )
}
