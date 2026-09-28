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

// Applied to document/credential uploads (compliance certificates, lease
// documents, contractor license/insurance, water bills) — these skip
// compressImage entirely and go straight to Storage, so this is the only
// real check standing behind an upload; the input's accept="" attribute is
// UI sugar only and does nothing to stop a drag-drop or a direct API call.
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024 // 20MB — generous for a scanned PDF or phone photo of a document
const DOCUMENT_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx']
const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

// Returns an error string to show the user, or null if the file's fine.
// allowedExtensions narrows the list for a form whose accept="" attribute
// advertises fewer types (e.g. no .doc/.docx) than the general default.
export function validateDocumentFile(file: File, opts?: { allowedExtensions?: string[] }): string | null {
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `${file.name} is too large (over 20MB). Use a smaller file or a lower-resolution scan.`
  }
  const allowedExtensions = opts?.allowedExtensions || DOCUMENT_EXTENSIONS
  const ext = file.name.split('.').pop()?.toLowerCase()
  const typeOk = !!file.type && DOCUMENT_MIME_TYPES.includes(file.type)
  const extOk = !!ext && allowedExtensions.includes(ext)
  // Either signal matching is enough — some browsers/OSes report a blank or
  // generic file.type for certain document types, so extension alone is
  // fine when that happens, and vice versa for an extensionless file.
  if (!typeOk && !extOk) {
    return `${file.name} isn't a supported file type. Use a PDF, Word doc, or photo (JPG/PNG).`
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
