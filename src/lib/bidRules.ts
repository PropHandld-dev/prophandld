// Product rule (Joshua, 2026-11-13): a bid is at least $50, and a price
// change may be any size (e.g. +$10 in parts) as long as the job total
// stays at or above $50. Shared by the bid form, the submit route, the
// price-change form and the payment route.
export const MIN_JOB_TOTAL = 50

// True when a number has no fractions of a cent ($150.999 is rejected, not
// silently rounded to $151).
export function hasCentPrecision(n: number): boolean {
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6
}
