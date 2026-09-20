// Phone photos are routinely 3–8 MB. Uploaded one after another over mobile
// data, that's most of the wait after tapping Submit. Landlords and
// contractors only need to see the problem, so photos are shrunk to a
// sensible size first. Anything that isn't a plain image, or that can't be
// decoded (some HEIC files), is uploaded untouched rather than failing.
const MAX_DIMENSION = 1600
const QUALITY = 0.8
const SKIP_UNDER_BYTES = 350 * 1024

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  if (file.size <= SKIP_UNDER_BYTES) return file

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
