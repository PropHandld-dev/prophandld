import { compressImage } from '@/lib/imageCompress'

// Prepares a photo or PDF for an AI read: photos are shrunk first so the
// upload stays small and fast; PDFs go as they are (up to ~4 MB).
export async function fileForAi(file: File): Promise<{ fileBase64: string; mediaType: string } | { error: string }> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  const ready = isPdf ? file : await compressImage(file)
  if (ready.size > 4 * 1024 * 1024) return { error: 'That file is too large to read. Try a smaller photo or PDF.' }
  const mediaType = isPdf ? 'application/pdf' : ready.type === 'image/png' ? 'image/png' : ready.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
  const buf = new Uint8Array(await ready.arrayBuffer())
  let binary = ''
  for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return { fileBase64: btoa(binary), mediaType }
}

export async function scanDocument(file: File, purpose: 'receipt' | 'utility_bill') {
  const prepared = await fileForAi(file)
  if ('error' in prepared) return { error: prepared.error }
  const res = await fetch('/api/ai-assist/scan-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...prepared, purpose }),
  }).catch(() => null)
  const data = res ? await res.json().catch(() => ({})) : {}
  if (!res?.ok) return { error: data.error || "Couldn't read that one." }
  return data as {
    amount: number | null
    date: string | null
    vendor: string | null
    description: string | null
    category: string | null
    direction: 'in' | 'out' | null
    utilityKind: string | null
    periodStart: string | null
    periodEnd: string | null
  }
}
