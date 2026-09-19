// Shared by the landlord/contractor/renter job-schedule proposal
// modals so the window options and their real-world hour ranges never
// drift apart — a mismatch is exactly what let "Morning (8am-12pm)"
// be submitted alongside a 9pm specific time with no error.
export const TIME_WINDOWS = [
  { value: 'morning', label: 'Morning (8am–12pm)', startHour: 8, endHour: 12 },
  { value: 'afternoon', label: 'Afternoon (12pm–5pm)', startHour: 12, endHour: 17 },
  { value: 'evening', label: 'Evening (5pm–8pm)', startHour: 17, endHour: 20 },
]

// Once a schedule is confirmed, a change within 2 days of the
// appointment can't go through the normal "propose a new time, other
// side confirms" flow — there isn't time left for that round trip, and
// a change that close to the date needs a direct conversation instead.
export const RESCHEDULE_LOCKOUT_DAYS = 2

export function rescheduleLockError(confirmedDate: string): string | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const apptDate = new Date(confirmedDate + 'T00:00:00')
  const daysUntil = Math.round((apptDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))

  if (daysUntil < RESCHEDULE_LOCKOUT_DAYS) {
    const label = apptDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    return `Too close to reschedule online — the appointment is ${label}. Message the other party directly to work it out.`
  }
  return null
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
