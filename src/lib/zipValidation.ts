// Caught live by an external audit (SEC-02): property ZIP fields accepted
// any text ("QA-INVALID-ZIP") with no format check at all. Same bug class
// already fixed on the contractor service_zip field — see that field's own
// comment for why this is format-only, not a real existence check.
export function isValidZip(zip: string): boolean {
  return /^\d{5}$/.test(zip.trim())
}
