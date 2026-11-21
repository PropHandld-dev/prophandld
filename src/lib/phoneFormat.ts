// Canonical US phone -> E.164 formatter, used wherever a number needs to be
// handed to Twilio or Stripe. Previously duplicated independently in
// api/phone/send-code and api/stripe/connect/onboard — consolidated here so
// a fix in one place covers every caller. Distinct from normalizePhone in
// api/signup/check-landlord-phone, which strips to a bare last-10-digit
// string for duplicate-account matching, not for sending anything.
export function toE164(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

// "2675551234" -> "(267) 555-1234" for showing a number back to its owner.
// Anything that isn't a plain US number is returned as typed.
export function formatPhoneForDisplay(phone: string): string {
  const e164 = toE164(phone)
  if (!e164) return phone
  const d = e164.slice(2)
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}
