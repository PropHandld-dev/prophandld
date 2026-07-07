// Free, no-API-key ZIP code geocoding via zippopotam.us (US ZIP codes only)
export async function geocodeZip(zip: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const cleanZip = zip.trim().slice(0, 5)
    const response = await fetch(`https://api.zippopotam.us/us/${cleanZip}`)

    if (!response.ok) return null

    const data = await response.json()
    const place = data.places?.[0]

    if (!place) return null

    return {
      lat: parseFloat(place.latitude),
      lng: parseFloat(place.longitude),
    }
  } catch (err) {
    console.error('Error geocoding ZIP:', err)
    return null
  }
}
