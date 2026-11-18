// Remembers, on this device, which signed-in user is a PM company member,
// so Home can go straight to /landlord/pm instead of drawing the landlord
// dashboard first and then redirecting. Stored as the user's id, so it
// never applies to a different account signing in on the same browser.
const KEY = 'prophandld:pm-home'

export function rememberPmHome(userId: string | null) {
  try {
    if (userId) localStorage.setItem(KEY, userId)
    else localStorage.removeItem(KEY)
  } catch {}
}

export function isRememberedPmHome(userId: string | null | undefined): boolean {
  if (!userId) return false
  try {
    return localStorage.getItem(KEY) === userId
  } catch {
    return false
  }
}
