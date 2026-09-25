'use client'

import { useEffect, useState } from 'react'

// Google's Street View Static API returns a real photo for a plain address —
// no map SDK, no script tag, just an image URL. Reuses the same key that
// already powers address autocomplete on property forms.
//
// Checked against the metadata endpoint first (a tiny JSON response, not an
// image load) so a street with no coverage shows nothing instead of
// Google's own gray "Sorry, we have no imagery here" placeholder, which
// would look like a broken image inside our own design.
export function StreetView({ address, city, className = '' }: { address: string; city?: string | null; className?: string }) {
  const [status, setStatus] = useState<'checking' | 'ok' | 'none'>('checking')
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const location = encodeURIComponent([address, city].filter(Boolean).join(', '))

  useEffect(() => {
    if (!apiKey) {
      setStatus('none')
      return
    }
    let cancelled = false
    fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${location}&key=${apiKey}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setStatus(data?.status === 'OK' ? 'ok' : 'none')
      })
      .catch(() => {
        if (!cancelled) setStatus('none')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, apiKey])

  if (status !== 'ok') return null

  const src = `https://maps.googleapis.com/maps/api/streetview?size=640x320&location=${location}&key=${apiKey}`

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`Street view of ${address}`}
      className={`w-full rounded-2xl border border-white/10 object-cover ${className}`}
      loading="lazy"
      onError={() => setStatus('none')}
    />
  )
}
