// Shared by the unit detail page (view mode) and the dedicated lease-edit
// page (src/app/landlord/properties/[id]/units/[unitId]/tenancy/edit) —
// pulled out so both can use the exact same date math rather than two
// copies drifting apart.

export function ordinal(day: number): string {
  if (day % 10 === 1 && day !== 11) return `${day}st`
  if (day % 10 === 2 && day !== 12) return `${day}nd`
  if (day % 10 === 3 && day !== 13) return `${day}rd`
  return `${day}th`
}

export function nextEscalationDate(leaseStart: string | null, frequencyMonths: number | null): Date | null {
  if (!leaseStart || !frequencyMonths) return null
  const start = new Date(leaseStart + 'T00:00:00')
  const now = new Date()
  const next = new Date(start)
  while (next <= now) {
    next.setMonth(next.getMonth() + frequencyMonths)
  }
  return next
}

type EscalationTenancy = {
  escalation_percent: number | null
  escalation_frequency_months: number | null
  lease_start: string | null
  rent_amount: number | null
}

// A suggestion, never an auto-change: rent never moves without the
// landlord explicitly saving the form. Only surfaces within a 30-day
// window around the most recent escalation boundary that's already
// passed — deliberately not trying to compound across multiple
// long-unaccounted cycles, since this has no record of whether an
// earlier cycle was already applied through a normal rent edit.
export function escalationSuggestion(tenancy: EscalationTenancy): { date: Date; suggested: number } | null {
  if (!tenancy.escalation_percent || !tenancy.escalation_frequency_months || !tenancy.lease_start || !tenancy.rent_amount) return null
  const next = nextEscalationDate(tenancy.lease_start, tenancy.escalation_frequency_months)
  if (!next) return null
  const previous = new Date(next)
  previous.setMonth(previous.getMonth() - tenancy.escalation_frequency_months)
  const start = new Date(tenancy.lease_start + 'T00:00:00')
  if (previous <= start) return null // no cycle has actually passed yet
  const daysSince = Math.round((Date.now() - previous.getTime()) / (24 * 60 * 60 * 1000))
  if (daysSince < 0 || daysSince > 30) return null
  const suggested = Math.round(Number(tenancy.rent_amount) * (1 + Number(tenancy.escalation_percent) / 100) * 100) / 100
  if (suggested <= Number(tenancy.rent_amount)) return null
  return { date: previous, suggested }
}
