// Scoped, ephemeral draft persistence for a form a user might lose to a
// refresh or a Back navigation — caught live by an external audit (DRAFT-01):
// a half-typed maintenance report had no recovery at all. sessionStorage
// (not localStorage) is the right scope here: it survives exactly a refresh
// or in-tab Back/forward, which is the actual loss this fixes, but
// disappears the moment the tab or browser closes — no separate "clear on
// logout" cleanup needed, and nothing lingers on a shared device after
// someone walks away.
export function saveDraft<T>(key: string, draft: T) {
  try {
    sessionStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Private browsing / storage blocked — drafts just don't persist, not a hard failure.
  }
}

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function clearDraft(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Nothing to clean up if storage isn't available in the first place.
  }
}
