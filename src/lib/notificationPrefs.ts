// Single, shared definition of "does this row's account want routine
// notification emails" — used at every send site that fetched the
// recipient's users row anyway (for their email/name/language), so this
// is a zero-cost, one-line check rather than an extra round trip.
// Defaults to true (same as the column's own DB default) if the row
// didn't select the column or it's null.
//
// Deliberately NOT applied to: the one-time welcome email, renter/
// contractor invite emails (the recipient may not have an account, let
// alone a preference, yet), support confirmation/escalation, and every
// admin-facing email (admin@ recipients aren't the account whose
// preference this is). Those stay unconditional on purpose — see the
// call site comments next to each one for why.
export function emailAllowed(row: { email_notifications_enabled?: boolean | null } | null | undefined): boolean {
  return row?.email_notifications_enabled !== false
}
