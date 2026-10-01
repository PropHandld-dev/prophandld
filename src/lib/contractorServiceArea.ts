import zipcodes from 'zipcodes'

// Shared by the contractor's own "what do I need" page and the admin
// compliance roster — both need the same answer to "which states and
// cities does this contractor's service radius actually reach", since a
// contractor near a state line works on both sides of it. Node-only (the
// zipcodes package), so this only ever runs server-side.
export function computeServiceArea(zip: string | null | undefined, radiusMiles: number | null | undefined) {
  const radius = Math.min(radiusMiles || 25, 100)
  const home = zip ? zipcodes.lookup(zip) : null

  const states = new Set<string>()
  const cities = new Map<string, { state: string; city: string }>()
  if (home?.state) {
    states.add(home.state)
    cities.set(`${home.state}:${home.city}`, { state: home.state, city: home.city })
    const nearby = (zipcodes.radius(zip as string, radius) as string[]) || []
    for (const z of nearby) {
      const place = zipcodes.lookup(z)
      if (!place?.state) continue
      states.add(place.state)
      cities.set(`${place.state}:${place.city}`, { state: place.state, city: place.city })
    }
  }

  return {
    homeState: home?.state || null,
    homeCity: home?.city || null,
    radiusMiles: radius,
    states: Array.from(states),
    cities: Array.from(cities.values()),
  }
}
