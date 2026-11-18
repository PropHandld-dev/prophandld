import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { claudeJson } from '@/lib/claude'
import { aiAccessFor } from '@/lib/aiAccess'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'

export const maxDuration = 45

const MEDIA = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const
const LEDGER_CATEGORIES = ['repair', 'utilities', 'insurance', 'tax', 'mortgage', 'hoa', 'supplies', 'management', 'legal', 'other', 'rent', 'deposit', 'other_income']
const UTILITY_KINDS = ['water', 'electric', 'gas', 'trash', 'sewer', 'internet', 'other']

type Scan = {
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

// POST { fileBase64, mediaType, purpose: 'receipt' | 'utility_bill' }
// Reads a receipt or utility bill photo/PDF and returns the fields to
// prefill. The person always reviews them before saving.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const access = await aiAccessFor(admin, user)
  if (!access.allowed) return NextResponse.json({ error: 'Prophandld AI is not turned on for this account.', needsAi: true }, { status: 402 })
  if (await tooManyAiAssistRequests('scan-document', user.id, 30)) {
    return NextResponse.json({ error: 'Too many scans right now. Try again in a few minutes.' }, { status: 429 })
  }

  const b = (await request.json().catch(() => ({}))) as { fileBase64?: string; mediaType?: string; purpose?: string }
  if (!b.fileBase64 || !MEDIA.includes(b.mediaType as any)) return NextResponse.json({ error: 'Use a photo or PDF of the receipt or bill.' }, { status: 400 })
  if (b.fileBase64.length > 5_500_000) return NextResponse.json({ error: 'That file is too large to scan. Try a smaller photo.' }, { status: 400 })
  const purpose = b.purpose === 'utility_bill' ? 'utility_bill' : 'receipt'

  try {
    const raw = await claudeJson<Scan>({
      system:
        'You read receipts, invoices and utility bills for a property management app and extract fields. ' +
        'Only report what is clearly printed. Use null when a field is missing or unreadable; never guess. ' +
        'Dates are YYYY-MM-DD. amount is the total due or paid as a plain number. ' +
        'For a utility bill, amount is the amount due for this bill (not a past balance), and periodStart/periodEnd are the service period.',
      prompt:
        `This is a ${purpose === 'utility_bill' ? 'utility bill' : 'receipt or invoice'}. Return JSON with keys: ` +
        'amount (number|null), date (bill or payment date|null), vendor (business name|null), ' +
        'description (what it was for, under 12 words|null), ' +
        `category (one of ${LEDGER_CATEGORIES.join(', ')}|null; "repair" for contractor/repair work), ` +
        'direction ("out" for money paid, "in" for money received|null), ' +
        `utilityKind (one of ${UTILITY_KINDS.join(', ')}|null; only for utility bills), ` +
        'periodStart (date|null), periodEnd (date|null).',
      file: { base64: b.fileBase64, mediaType: b.mediaType as any },
      maxTokens: 600,
      track: { billedUserId: access.billedUserId, callerUserId: user.id, feature: `scan-${purpose}` },
    })
    const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
    const amount = typeof raw?.amount === 'number' && raw.amount > 0 && raw.amount < 10_000_000 ? Math.round(raw.amount * 100) / 100 : null
    return NextResponse.json({
      amount,
      date: isDate(raw?.date) ? raw.date : null,
      vendor: typeof raw?.vendor === 'string' ? raw.vendor.slice(0, 120) : null,
      description: typeof raw?.description === 'string' ? raw.description.slice(0, 300) : null,
      category: LEDGER_CATEGORIES.includes(raw?.category || '') ? raw.category : null,
      direction: raw?.direction === 'in' || raw?.direction === 'out' ? raw.direction : null,
      utilityKind: UTILITY_KINDS.includes(raw?.utilityKind || '') ? raw.utilityKind : null,
      periodStart: isDate(raw?.periodStart) ? raw.periodStart : null,
      periodEnd: isDate(raw?.periodEnd) ? raw.periodEnd : null,
    })
  } catch (err) {
    console.error('ai-assist/scan-document: failed', err)
    return NextResponse.json({ error: "Couldn't read that one. Try a clearer photo, or fill it in by hand." }, { status: 500 })
  }
}
