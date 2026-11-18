import type { SupabaseClient } from '@supabase/supabase-js'

export const UTILITY_KINDS = ['water', 'electric', 'gas', 'trash', 'sewer', 'internet', 'other'] as const
export type UtilityKind = (typeof UTILITY_KINDS)[number]

export const UTILITY_LABELS: Record<UtilityKind, { en: string; es: string }> = {
  water: { en: 'Water', es: 'Agua' },
  electric: { en: 'Electric', es: 'Electricidad' },
  gas: { en: 'Gas', es: 'Gas' },
  trash: { en: 'Trash', es: 'Basura' },
  sewer: { en: 'Sewer', es: 'Alcantarillado' },
  internet: { en: 'Internet', es: 'Internet' },
  other: { en: 'Other', es: 'Otro' },
}

export type UtilityCharge = {
  id: string
  rentPaymentId: string
  kind: UtilityKind
  label: string | null
  amount: number
  periodStart: string | null
  periodEnd: string | null
  billUrl: string | null
  billFilename: string | null
}

export function utilityName(c: { kind: UtilityKind; label?: string | null }, lang: 'en' | 'es' = 'en') {
  if (c.kind === 'other' && c.label) return c.label
  return UTILITY_LABELS[c.kind]?.[lang] || c.kind
}

export const BILL_MAX_BYTES = 20 * 1024 * 1024

// The real format from the file's first bytes; the name and MIME type are
// just labels a renamed file can fake.
export function sniffBill(bytes: Uint8Array): { ext: string; mime: string } | null {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return { ext: 'pdf', mime: 'application/pdf' }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return { ext: 'png', mime: 'image/png' }
  return null
}

// Every charge for the given rent months, with a short-lived link to each
// attached bill. Callers must already have confirmed the user may see
// these months.
export async function loadUtilityCharges(admin: SupabaseClient, rentPaymentIds: string[]): Promise<UtilityCharge[]> {
  if (rentPaymentIds.length === 0) return []
  const { data, error } = await admin
    .from('rent_utility_charges')
    .select('id, rent_payment_id, kind, label, amount, period_start, period_end, documents(filename, file_url)')
    .in('rent_payment_id', rentPaymentIds)
    .order('created_at', { ascending: true })
  if (error) throw error

  const paths = (data || []).map((r: any) => r.documents?.file_url).filter(Boolean) as string[]
  const signed = new Map<string, string>()
  if (paths.length > 0) {
    const { data: urls } = await admin.storage.from('documents').createSignedUrls(paths, 3600)
    for (const u of urls || []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl)
  }

  return (data || []).map((r: any) => ({
    id: r.id,
    rentPaymentId: r.rent_payment_id,
    kind: r.kind,
    label: r.label,
    amount: Number(r.amount),
    periodStart: r.period_start,
    periodEnd: r.period_end,
    billUrl: r.documents?.file_url ? signed.get(r.documents.file_url) || null : null,
    billFilename: r.documents?.filename || null,
  }))
}
