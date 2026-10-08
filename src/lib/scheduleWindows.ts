// Shared by the landlord/contractor/renter job-schedule proposal
// modals so the window options and their real-world hour ranges never
// drift apart — a mismatch is exactly what let "Morning (8am-12pm)"
// be submitted alongside a 9pm specific time with no error.
export const TIME_WINDOWS = [
  { value: 'morning', label: 'Morning (8am–12pm)', startHour: 8, endHour: 12 },
  { value: 'afternoon', label: 'Afternoon (12pm–5pm)', startHour: 12, endHour: 17 },
  { value: 'evening', label: 'Evening (5pm–8pm)', startHour: 17, endHour: 20 },
]

// A change proposed this close to a confirmed appointment used to be
// hard-blocked (the normal propose-and-confirm flow requires a round trip
// that felt "too close" to fit) and the only escape hatch was "message the
// other party directly" — a real dead end, since nothing in the app ever
// actually updated even after a real conversation, weather or a sudden
// conflict rarely waits for 2 days' notice, and the person on the other
// end still needed a clean way to see and confirm the new time, not just
// take someone's word for it. The lockout is gone; RESCHEDULE_LOCKOUT_DAYS
// now only decides when a change is flagged as urgent, not whether it's
// allowed at all — the real safety mechanism was always the other side
// having to explicitly confirm, which a late change still requires exactly
// the same as any other.
export const RESCHEDULE_LOCKOUT_DAYS = 2

export function isLateReschedule(confirmedDate: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const apptDate = new Date(confirmedDate + 'T00:00:00')
  const daysUntil = Math.round((apptDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  return daysUntil < RESCHEDULE_LOCKOUT_DAYS
}

// Shown as a heads-up inside the reschedule form when isLateReschedule is
// true — proposing still works, this just sets expectations that it'll
// reach the other side as an urgent, wake-the-phone notification instead
// of an ordinary one, since a change this close to the date shouldn't sit
// unread.
export function lateRescheduleWarning(confirmedDate: string): string | null {
  if (!isLateReschedule(confirmedDate)) return null
  const apptDate = new Date(confirmedDate + 'T00:00:00')
  const label = apptDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  return `Heads up: the current appointment is ${label}, very soon. The other side will get an urgent alert the moment you propose a new time, so let them know to check as soon as they can.`
}

// Most states expect a landlord (or anyone acting for them, including a
// contractor) to give a tenant meaningful advance notice before entering
// their home for non-emergency work — commonly cited around 24 hours.
// This is a best-practice default, not a citation of any one state's exact
// statute (those vary), which is also why this nudges rather than hard-
// blocks: the same reasoning the team already landed on for
// RESCHEDULE_LOCKOUT_DAYS above — the real protection is that the other
// side still has to explicitly confirm, not that the app refuses to let a
// time be proposed at all. A genuinely urgent job is the standard
// exception in every version of this rule, so it's excluded entirely.
export const ENTRY_NOTICE_HOURS = 24

// `time` is an <input type="time"> value ("HH:MM") or null/empty — when no
// specific time was given, the window's own start hour is the earliest the
// visit could realistically happen, so that's what gets checked.
export function hoursUntilProposed(date: string, window: string, time: string | null): number {
  const win = TIME_WINDOWS.find((w) => w.value === window)
  const [hours, minutes] = time ? time.split(':').map(Number) : [win?.startHour ?? 8, 0]
  const proposed = new Date(date + 'T00:00:00')
  proposed.setHours(hours, minutes, 0, 0)
  return (proposed.getTime() - Date.now()) / (60 * 60 * 1000)
}

// Shown next to the date/time fields while proposing or confirming a time —
// same spirit as lateRescheduleWarning just above: inform, don't block.
// Never shown for an emergency job, where same-day access is the norm, not
// an exception.
export function shortNoticeWarning(date: string, window: string, time: string | null, isEmergency: boolean): string | null {
  if (isEmergency || !date) return null
  const hoursUntil = hoursUntilProposed(date, window, time)
  if (hoursUntil >= ENTRY_NOTICE_HOURS) return null
  if (hoursUntil < 0) return null // a past/same-moment date is caught elsewhere, not this check's job
  return `Heads up: this is less than ${ENTRY_NOTICE_HOURS} hours' notice. Most places expect at least a day's notice before entering a tenant's home for non-emergency work — fine if everyone's genuinely OK with it, but worth a quick check before you send it.`
}

// `time` is an <input type="time"> value ("HH:MM", 24h). Returns an
// error message if it falls outside the chosen window, else null.
export function validateScheduleTime(window: string, time: string): string | null {
  if (!time) return null
  const win = TIME_WINDOWS.find((w) => w.value === window)
  if (!win) return null

  const [hours, minutes] = time.split(':').map(Number)
  const totalMinutes = hours * 60 + minutes
  const startMinutes = win.startHour * 60
  const endMinutes = win.endHour * 60

  if (totalMinutes < startMinutes || totalMinutes >= endMinutes) {
    const label = new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    return `${label} isn't within the ${win.label} window. Pick a time inside the window, or choose a different window.`
  }
  return null
}
