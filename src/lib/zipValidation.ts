// Caught live by an external audit (SEC-02): property ZIP fields accepted
// any text ("QA-INVALID-ZIP") with no format check at all. Same bug class
// already fixed on the contractor service_zip field — see that field's own
// comment for why this is format-only, not a real existence check.
export function isValidZip(zip: string): boolean {
  return /^\d{5}$/.test(zip.trim())
}

// Real existence checks (state code, ZIP exists, ZIP matches the state,
// city has letters) run on the server, where the ZIP data lives. Returns
// an error to show, or the normalized uppercase state. A network failure
// lets the save through rather than blocking someone offline-ish.
export async function checkAddressOnServer(form: { city?: string; state?: string; zip?: string }): Promise<{ error: string | null; state: string }> {
  try {
    const res = await fetch('/api/address/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const data = await res.json()
    if (data.ok === false) return { error: data.error, state: (form.state || '').trim().toUpperCase() }
    return { error: null, state: data.state ?? (form.state || '').trim().toUpperCase() }
  } catch {
    return { error: null, state: (form.state || '').trim().toUpperCase() }
  }
}
