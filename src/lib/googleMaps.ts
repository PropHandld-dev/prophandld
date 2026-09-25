// Shared by AddressAutocomplete and PropertiesMap so two components on the
// same page never race to inject the script twice — whoever asks first
// starts the load, everyone else just waits on the same promise.
declare global {
  interface Window {
    google?: any
  }
}

let scriptLoadingPromise: Promise<void> | null = null

// Always loads the 'places' library, even for callers that only need the
// base map (a plain map page costs nothing extra by having it available,
// and it avoids a real bug: if the first caller on a page loaded without
// 'places' and a second caller later assumed it was already there because
// `window.google.maps` existed, autocomplete would silently break).
export function loadGoogleMapsScript(apiKey: string): Promise<void> {
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

// A dark map style tuned to the app's own navy/teal palette instead of
// Google's default light basemap, so the map reads as part of the app
// rather than a light rectangle punched into a dark page.
export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0f2138' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0c1a2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8496ac' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1e3450' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1b2f48' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#132a45' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#22374f' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#6f819a' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1626' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4f6478' }] },
]
