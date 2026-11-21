// Auto-saved drafts for forms people get interrupted in: report an issue,
// a new job, add a property, a bid, guided setup. First added for DRAFT-01
// (a half-typed maintenance report had no recovery at all) using
// sessionStorage, which lost the draft the moment a phone killed the tab
// or the app was closed — the most common interruption. Now localStorage,
// so a draft survives closing the app. Every key passed in already
// includes the user's id, so on a shared device one person's draft is never
// shown to another, and anything older than 14 days is dropped on read.

const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
const PREFIX = 'prophandld:draft:'

type Stored<T> = { v: T; at: number }

export function saveDraft<T>(key: string, draft: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ v: draft, at: Date.now() } satisfies Stored<T>))
  } catch {
    // Private browsing / storage blocked — drafts just don't persist, not a hard failure.
  }
}

export function loadDraftWithTime<T>(key: string): Stored<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw) {
      const parsed = JSON.parse(raw) as Stored<T>
      if (parsed && typeof parsed.at === 'number' && Date.now() - parsed.at <= MAX_AGE_MS) return parsed
      localStorage.removeItem(PREFIX + key)
      return null
    }
    // A draft saved before the switch from sessionStorage.
    const legacy = sessionStorage.getItem(key)
    return legacy ? { v: JSON.parse(legacy) as T, at: Date.now() } : null
  } catch {
    return null
  }
}

export function loadDraft<T>(key: string): T | null {
  return loadDraftWithTime<T>(key)?.v ?? null
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(PREFIX + key)
    sessionStorage.removeItem(key)
  } catch {
    // Nothing to clean up if storage isn't available in the first place.
  }
}
