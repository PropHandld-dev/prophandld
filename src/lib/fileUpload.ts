// Client-side file-size guardrail. This is the first line of defense
// against uncompressed phone video (easily 50-150MB per clip) or an
// oversized document eating into Supabase Storage's free-tier 1GB cap
// before real users notice anything's wrong. No server-side enforcement
// exists yet — this only stops the upload button, not a direct API call.

// Document-style inputs (PDF/doc/image, no video allowed).
export const MAX_DOCUMENT_FILE_SIZE = 20 * 1024 * 1024 // 20MB

// Inputs that allow accept="image/*,video/*" (photos and video).
export const MAX_MEDIA_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export function formatMB(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`
}

// Returns an error string to show the user, or null if the file's within
// the limit.
export function validateFileSize(file: File, maxBytes: number): string | null {
  if (file.size > maxBytes) {
    return `${file.name} is ${formatMB(file.size)} — the limit is ${formatMB(maxBytes)}.`
  }
  return null
}
