// Canonicalizes common street-suffix abbreviations so "123 Main Rd" and
// "123 Main Road" compare equal for duplicate-property detection.
const SUFFIX_MAP: Record<string, string> = {
  street: 'st', str: 'st',
  avenue: 'ave', av: 'ave',
  road: 'rd',
  drive: 'dr', drv: 'dr',
  lane: 'ln',
  boulevard: 'blvd',
  court: 'ct',
  place: 'pl',
  circle: 'cir',
  parkway: 'pkwy',
  terrace: 'ter',
  highway: 'hwy',
  square: 'sq',
  trail: 'trl',
  apartment: 'apt',
  building: 'bldg',
  floor: 'fl',
  north: 'n', south: 's', east: 'e', west: 'w',
}

export function normalizeAddress(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,#]/g, '')
    .trim()
    .split(/\s+/)
    .map((word) => SUFFIX_MAP[word] || word)
    .join(' ')
}
