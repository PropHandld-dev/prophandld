// Pilot phase: everything is free (including Prophandld AI) and no prices
// are shown anywhere, while we hear from landlords, contractors and PMs
// before billing starts. On unless NEXT_PUBLIC_PILOT_FREE=off, so turning
// billing on at launch is one env change, not a code change.
export const PILOT_FREE = process.env.NEXT_PUBLIC_PILOT_FREE !== 'off'
export const PILOT_FREE_MONTHS = 6
