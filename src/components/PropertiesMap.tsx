'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { loadGoogleMapsScript, DARK_MAP_STYLE } from '@/lib/googleMaps'
import { BuildingIcon } from '@/components/icons'

type MapProperty = {
  id: string
  address: string
  city: string | null
  state: string | null
  lat: number | null
  lng: number | null
  propertyType: string | null
}

// A small teal pin, drawn once as an SVG data URI, so every property reads
// as "this app" rather than Google's default red teardrop.
const PIN_SVG = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
  <path d="M17 0C7.6 0 0 7.6 0 17c0 12.7 17 25 17 25s17-12.3 17-25C34 7.6 26.4 0 17 0z" fill="url(#g)" stroke="#0C1A2E" stroke-width="1.5"/>
  <circle cx="17" cy="17" r="7" fill="#0C1A2E"/>
  <path d="M13.2 17.6l3.8-3.2 3.8 3.2M14 17v3.4h6V17" stroke="#4FD1C0" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="42"><stop stop-color="#12A5A9"/><stop offset="1" stop-color="#0A7B7E"/></linearGradient></defs>
</svg>`)}`

export function PropertiesMap({ properties }: { properties: MapProperty[] }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<MapProperty | null>(null)

  const located = properties.filter((p) => p.lat != null && p.lng != null)
  const missing = properties.length - located.length

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey || !mapRef.current || located.length === 0) return

    let cancelled = false
    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !mapRef.current || !window.google) return
        const bounds = new window.google.maps.LatLngBounds()
        located.forEach((p) => bounds.extend({ lat: p.lat!, lng: p.lng! }))

        const map = new window.google.maps.Map(mapRef.current, {
          styles: DARK_MAP_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
        })
        mapInstance.current = map

        if (located.length === 1) {
          map.setCenter({ lat: located[0].lat!, lng: located[0].lng! })
          map.setZoom(15)
        } else {
          map.fitBounds(bounds, 48)
        }

        located.forEach((p) => {
          const marker = new window.google.maps.Marker({
            position: { lat: p.lat!, lng: p.lng! },
            map,
            icon: { url: PIN_SVG, scaledSize: new window.google.maps.Size(30, 37), anchor: new window.google.maps.Point(15, 37) },
            title: p.address,
          })
          marker.addListener('click', () => setSelected(p))
        })

        setReady(true)
      })
      .catch((err) => {
        console.error('PropertiesMap: failed to load', err)
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located.length])

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || error) return null
  if (located.length === 0) {
    return (
      <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
        <BuildingIcon className="w-8 h-8 text-white/40 mx-auto mb-3" />
        <p className="text-white/60 text-sm">
          None of your properties have a saved location yet. Open one and re-save its address to add it to the map.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="relative rounded-2xl overflow-hidden border border-white/8" style={{ height: '440px' }}>
        <div ref={mapRef} className="absolute inset-0" />
        {!ready && (
          <div className="absolute inset-0 bg-white/3 animate-pulse flex items-center justify-center">
            <span className="text-white/40 text-sm">Loading map…</span>
          </div>
        )}

        {selected && (
          <div className="absolute left-3 right-3 bottom-3 sm:left-4 sm:right-auto sm:w-80 bg-[#0F2138]/97 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)] p-4 motion-safe:animate-[floatUp_0.2s_ease-out]">
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute top-2.5 right-2.5 text-white/40 hover:text-white transition text-lg leading-none w-6 h-6 flex items-center justify-center"
            >
              ×
            </button>
            <p className="text-white font-semibold pr-6">{selected.address}</p>
            <p className="text-white/50 text-sm mt-0.5 capitalize">
              {selected.city}{selected.state ? `, ${selected.state}` : ''}{selected.propertyType ? ` · ${selected.propertyType}` : ''}
            </p>
            <Link
              href={`/landlord/properties/${selected.id}`}
              className="inline-block mt-3 text-[#12A5A9] text-sm font-semibold hover:underline"
            >
              View property →
            </Link>
          </div>
        )}
      </div>
      {missing > 0 && (
        <p className="text-white/40 text-xs mt-3">
          {missing} propert{missing === 1 ? 'y isn’t' : 'ies aren’t'} shown — {missing === 1 ? 'it has' : 'they have'} no saved location yet. Open{missing === 1 ? ' it' : ' one'} and re-save its address to add {missing === 1 ? 'it' : 'them'}.
        </p>
      )}
    </div>
  )
}
