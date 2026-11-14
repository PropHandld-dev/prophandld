'use client'

import { useEffect, useRef, useState } from 'react'
import { loadGoogleMapsScript, DARK_MAP_STYLE } from '@/lib/googleMaps'
import { MapPinIcon } from '@/components/icons'

export type PmMapProperty = {
  id: string
  address: string
  city: string | null
  lat: number
  lng: number
  ownerName: string
  complianceStatus: 'ok' | 'at-risk' | 'overdue'
}

const STATUS_COLOR: Record<PmMapProperty['complianceStatus'], string> = {
  ok: '#12A5A9',
  'at-risk': '#F2B544',
  overdue: '#E25555',
}
const STATUS_LABEL: Record<PmMapProperty['complianceStatus'], string> = {
  ok: 'Compliance OK',
  'at-risk': 'Compliance due soon',
  overdue: 'Compliance overdue',
}

// Same pin shape as PropertiesMap's teal-only version, just parameterized
// by color -- distinct pin colors across a whole portfolio is the actual
// point of this map (which of my clients' properties need attention,
// spatially), so this can't just reuse that component's single fixed
// color.
function pinSvg(color: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
  <path d="M17 0C7.6 0 0 7.6 0 17c0 12.7 17 25 17 25s17-12.3 17-25C34 7.6 26.4 0 17 0z" fill="${color}" stroke="#0C1A2E" stroke-width="1.5"/>
  <circle cx="17" cy="17" r="7" fill="#0C1A2E"/>
  <circle cx="17" cy="17" r="3.2" fill="${color}"/>
</svg>`)}`
}

export function PmComplianceMap({ properties }: { properties: PmMapProperty[] }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<PmMapProperty | null>(null)

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey || !mapRef.current || properties.length === 0) return

    let cancelled = false
    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !mapRef.current || !window.google) return
        const bounds = new window.google.maps.LatLngBounds()
        properties.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }))

        const map = new window.google.maps.Map(mapRef.current, {
          styles: DARK_MAP_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
        })

        if (properties.length === 1) {
          map.setCenter({ lat: properties[0].lat, lng: properties[0].lng })
          map.setZoom(15)
        } else {
          map.fitBounds(bounds, 48)
        }

        properties.forEach((p) => {
          const marker = new window.google.maps.Marker({
            position: { lat: p.lat, lng: p.lng },
            map,
            icon: { url: pinSvg(STATUS_COLOR[p.complianceStatus]), scaledSize: new window.google.maps.Size(30, 37), anchor: new window.google.maps.Point(15, 37) },
            title: `${p.address} — ${STATUS_LABEL[p.complianceStatus]}`,
          })
          marker.addListener('click', () => setSelected(p))
        })

        setReady(true)
      })
      .catch((err) => {
        console.error('PmComplianceMap: failed to load', err)
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties.length])

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || error || properties.length === 0) return null

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold">Compliance map</h2>
        <div className="flex items-center gap-3 text-[11px] text-white/50">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR.ok }} /> OK</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR['at-risk'] }} /> Due soon</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR.overdue }} /> Overdue</span>
        </div>
      </div>
      <div className="relative rounded-xl overflow-hidden border border-white/8" style={{ height: '360px' }}>
        <div ref={mapRef} className="absolute inset-0" />
        {!ready && (
          <div className="absolute inset-0 bg-white/3 animate-pulse flex items-center justify-center">
            <span className="text-white/40 text-sm">Loading map…</span>
          </div>
        )}
        {selected && (
          <div className="absolute left-3 right-3 bottom-3 sm:left-4 sm:right-auto sm:w-72 bg-[#0F2138]/97 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)] p-4 motion-safe:animate-[floatUp_0.2s_ease-out]">
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute top-2.5 right-2.5 text-white/40 hover:text-white transition text-lg leading-none w-6 h-6 flex items-center justify-center"
            >
              ×
            </button>
            <div className="flex items-start gap-2 pr-6">
              <MapPinIcon className="w-4 h-4 text-white/40 shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-semibold">{selected.address}</p>
                <p className="text-white/50 text-sm mt-0.5">{selected.city}</p>
                <p className="text-white/40 text-xs mt-1">{selected.ownerName}</p>
              </div>
            </div>
            <p className="text-sm font-semibold mt-3" style={{ color: STATUS_COLOR[selected.complianceStatus] }}>
              {STATUS_LABEL[selected.complianceStatus]}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
