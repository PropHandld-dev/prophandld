// Videos aren't compressed the way photos are (compressImage passes them
// through untouched) — a phone can easily produce a 200MB+ clip, which
// would either fail mid-upload on mobile data or blow through Supabase
// storage costs for something a much shorter clip would have shown just as
// well. Capped client-side, before the upload even starts, with a message
// that says why rather than a generic failure.
const MAX_VIDEO_BYTES = 60 * 1024 * 1024 // 60MB — a minute or so of phone video at normal quality

export function isVideoFile(file: File) {
  return file.type.startsWith('video/')
}

// Returns an error string to show the user, or null if the file's fine.
export function validateMediaFile(file: File): string | null {
  if (isVideoFile(file) && file.size > MAX_VIDEO_BYTES) {
    return `${file.name} is too large (over 60MB). Trim it or take a shorter clip.`
  }
  return null
}

// Same test applied to a stored path (not a File) — used wherever media is
// already uploaded and just needs to render as a <video> instead of <img>.
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'm4v', 'avi']

export function isVideoPath(path: string | undefined | null): boolean {
  if (!path) return false
  const ext = path.split('.').pop()?.toLowerCase().split('?')[0]
  return !!ext && VIDEO_EXTENSIONS.includes(ext)
}
