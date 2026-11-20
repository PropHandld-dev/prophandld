import zipcodes from 'zipcodes'

// Server-only (the zipcodes package is ~5MB of ZIP data). Catches what a
// format check can't: a state code that doesn't exist, a ZIP that doesn't
// exist, a ZIP from a different state than the one typed, and a city with
// no letters in it.
const STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI GU AS MP'.split(' '))

export type AddressCheck =
  | { ok: true; state: string; zipCity: string | null }
  | { ok: false; field: 'state' | 'zip' | 'city'; error: string }

export function checkUsAddress(input: { city?: string | null; state?: string | null; zip?: string | null }): AddressCheck {
  const state = (input.state || '').trim().toUpperCase()
  const city = (input.city || '').trim()
  const zip = (input.zip || '').trim()
  if (city && !/\p{L}/u.test(city)) return { ok: false, field: 'city', error: 'Enter a real city name.' }
  if (state && !STATES.has(state)) return { ok: false, field: 'state', error: `"${input.state}" isn't a US state. Use the 2-letter code, like PA.` }
  let zipCity: string | null = null
  if (zip) {
    if (!/^\d{5}$/.test(zip)) return { ok: false, field: 'zip', error: 'Enter a 5-digit ZIP code, like 19103.' }
    const place = zipcodes.lookup(zip)
    if (!place) return { ok: false, field: 'zip', error: `${zip} isn't a real US ZIP code.` }
    if (state && place.state !== state) return { ok: false, field: 'zip', error: `ZIP ${zip} is in ${place.state}, not ${state}. Check the ZIP or the state.` }
    zipCity = place.city
  }
  return { ok: true, state, zipCity }
}
