// Videos aren't compressed the way photos are (compressImage passes them
// through untouched) — a phone can easily produce a 200MB+ clip, which
// would either fail mid-upload on mobile data or blow through Supabase
// storage costs for something a much shorter clip would have shown just as
// well. Capped client-side, before the upload even starts, with a message
// that says why rather than a generic failure.
const MAX_VIDEO_BYTES = 60 * 1024 * 1024 // 60MB — a minute or so of phone video at normal quality

// Images on these inputs never went through compressImage's document path,
// so an uncompressed max-resolution phone photo had no ceiling at all
// until now — same 20MB reasoning as MAX_DOCUMENT_BYTES below.
const MAX_IMAGE_BYTES = 20 * 1024 * 1024 // 20MB

export function isVideoFile(file: File) {
  return file.type.startsWith('video/')
}

// Caught live by an external audit: a plain-text file renamed to .jpg or
// .mp4 sailed through every check here, since nothing actually looked at
// the bytes — extension and MIME are both just labels the browser trusts
// the file picker (or a direct API call) to report honestly. This doesn't
// attempt real format parsing (that's a much bigger job, and still
// wouldn't catch every malformed file), but it catches the exact failure
// mode demonstrated: every real image, video, PDF or Office document
// starts with binary bytes, never a page of printable text, so a file
// that's >95% printable ASCII in its first chunk is never a valid one of
// these, whatever its name claims.
async function looksLikePlainText(file: File): Promise<boolean> {
  const sample = await file.slice(0, 512).arrayBuffer()
  const bytes = new Uint8Array(sample)
  if (bytes.length === 0) return false
  let printable = 0
  for (const b of bytes) {
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126)) printable++
  }
  return printable / bytes.length > 0.95
}

// Returns an error string to show the user, or null if the file's fine.
export async function validateMediaFile(file: File): Promise<string | null> {
  if (file.size === 0) {
    return `${file.name} is empty (0 bytes). Choose a real file.`
  }
  if (isVideoFile(file)) {
    if (file.size > MAX_VIDEO_BYTES) {
      return `${file.name} is too large (over 60MB). Trim it or take a shorter clip.`
    }
  } else if (file.size > MAX_IMAGE_BYTES) {
    return `${file.name} is too large (over 20MB). Use a smaller file or a lower-resolution photo.`
  }
  if (await looksLikePlainText(file)) {
    return `${file.name} doesn't look like a valid photo or video. It may be corrupted or renamed from a different file type.`
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
export async function validateDocumentFile(file: File, opts?: { allowedExtensions?: string[] }): Promise<string | null> {
  // Caught live by an external audit: a 0-byte file passed straight
  // through (0 is never over the max) and was accepted as a normal
  // document. This doesn't validate that a PDF's actual content is
  // well-formed — that needs real parsing, not a client-side size check —
  // but it closes the trivial, obviously-broken case.
  if (file.size === 0) {
    return `${file.name} is empty (0 bytes). Choose a real file.`
  }
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
  // Caught live by an external audit: a plain-text file renamed to .jpg
  // passed the extension/MIME check above (both are just labels) and was
  // stored as a real document. See looksLikePlainText's own note — no
  // real PDF, Word doc or photo is ever mostly-printable-text in its
  // first bytes, whatever its name claims.
  if (await looksLikePlainText(file)) {
    return `${file.name} doesn't look like a valid file. It may be corrupted or renamed from a different file type.`
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
