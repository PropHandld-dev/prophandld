'use client'

import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    google?: any
  }
}

let scriptLoadingPromise: Promise<void> | null = null

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (window.google?.maps?.places) return Promise.resolve()
  if (scriptLoadingPromise) return scriptLoadingPromise

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Maps script'))
    document.head.appendChild(script)
  })
  return scriptLoadingPromise
}

export type AutocompletePlace = {
  address: string
  city: string
  state: string
  zip: string
  lat: number | null
  lng: number | null
}

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelected,
  placeholder,
  className,
  required,
}: {
  value: string
  onChange: (value: string) => void
  onPlaceSelected: (place: AutocompletePlace) => void
  placeholder?: string
  className?: string
  required?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const onPlaceSelectedRef = useRef(onPlaceSelected)
  onPlaceSelectedRef.current = onPlaceSelected

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey || !inputRef.current) return

    let cancelled = false
    let autocomplete: any = null

    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !inputRef.current || !window.google) return

        autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'us' },
          fields: ['address_components', 'geometry'],
        })

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace()
          if (!place?.address_components) return

          let streetNumber = ''
          let route = ''
          let city = ''
          let state = ''
          let zip = ''

          for (const c of place.address_components) {
            if (c.types.includes('street_number')) streetNumber = c.long_name
            if (c.types.includes('route')) route = c.long_name
            if (c.types.includes('locality')) city = c.long_name
            if (c.types.includes('administrative_area_level_1')) state = c.short_name
            if (c.types.includes('postal_code')) zip = c.long_name
          }

          onPlaceSelectedRef.current({
            address: [streetNumber, route].filter(Boolean).join(' '),
            city,
            state,
            zip,
            lat: place.geometry?.location?.lat() ?? null,
            lng: place.geometry?.location?.lng() ?? null,
          })
        })
      })
      .catch((err) => console.error('Google Maps script failed to load:', err))

    return () => {
      cancelled = true
      if (autocomplete && window.google) {
        window.google.maps.event.clearInstanceListeners(autocomplete)
      }
    }
  }, [])

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      required={required}
      className={className}
    />
  )
}
