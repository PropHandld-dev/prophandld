// Shared by the landlord's own per-property compliance page and the admin
// compliance roster — both need the exact same answer to "is this expired,
// expiring soon, or fine", from the exact same day-math, so the two views
// can never quietly disagree with each other.
export type ComplianceStatusKey = 'no_expiry' | 'expired' | 'expiring_soon' | 'current'

export function getComplianceStatus(expiryDate: string | null | undefined, reminderDays: number | null | undefined) {
  if (!expiryDate) return { key: 'no_expiry' as ComplianceStatusKey, daysUntil: null as number | null }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate + 'T00:00:00')
  const daysUntil = Math.round((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  const days = reminderDays ?? 30

  if (daysUntil < 0) return { key: 'expired' as ComplianceStatusKey, daysUntil }
  if (daysUntil <= days) return { key: 'expiring_soon' as ComplianceStatusKey, daysUntil }
  return { key: 'current' as ComplianceStatusKey, daysUntil }
}
