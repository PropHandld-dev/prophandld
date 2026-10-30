import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 60

const ITEM_TYPES = [
  'Rental License',
  'Lead Certification',
  'Smoke Detector Inspection',
  'CO Detector Inspection',
  'Fire Extinguisher Inspection',
  'Insurance Renewal',
]

type ComplianceExtraction = { item_type: string | null; expiry_date: string | null }

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']

// Today a landlord has to already know a license or insurance certificate's
// expiry date and type it in themselves, separately from uploading the
// document itself — this reads the uploaded document once and pre-fills
// both, same capability as the tenancy lease extraction, same review-
// before-save pattern (nothing here saves anything, the landlord's own
// Add Item button still does that).
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords can use AI Assist' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  if (!(await hasAiAssistAccess(supabaseAdmin, user.id))) {
    return NextResponse.json({ error: 'AI Assist is not active on this account' }, { status: 403 })
  }
  if (await tooManyAiAssistRequests('extract-compliance', user.id, 20)) {
    return NextResponse.json({ error: 'Too many uploads right now, try again in a few minutes.' }, { status: 429 })
  }

  const { fileBase64, mediaType } = (await request.json()) as { fileBase64?: string; mediaType?: string }
  if (!fileBase64 || !mediaType || !ALLOWED_MEDIA_TYPES.includes(mediaType)) {
    return NextResponse.json({ error: 'Upload a PDF, JPG, or PNG.' }, { status: 400 })
  }

  try {
    const result = await claudeJson<ComplianceExtraction>({
      system:
        'You read property compliance documents (rental licenses, inspection certificates, insurance ' +
        'declarations) for a property management app. Only report a value you can actually find stated in ' +
        'the document — if something is not clearly present or you are not confident, use null rather than ' +
        'guessing. expiry_date must be in YYYY-MM-DD format.',
      prompt:
        `Classify this document as exactly one of: ${ITEM_TYPES.join(', ')} — or null if it clearly doesn't ` +
        'match any of those. Also find its expiry/renewal date if one is stated. Return JSON with exactly ' +
        'these keys: item_type (string, one of the exact options above, or null), expiry_date (date or null).',
      file: { base64: fileBase64, mediaType: mediaType as any },
      maxTokens: 256,
      track: { billedUserId: user.id, callerUserId: user.id, feature: 'compliance-extraction' },
    })

    // Defensive — never let a near-miss string from the model leak into a
    // dropdown that only recognizes the exact ITEM_TYPES values.
    if (result.item_type && !ITEM_TYPES.includes(result.item_type)) {
      result.item_type = null
    }

    return NextResponse.json({ extracted: result })
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      console.error('ai-assist/extract/compliance: Claude not configured', err)
      return NextResponse.json({ error: 'AI reading is not set up yet.' }, { status: 503 })
    }
    console.error('ai-assist/extract/compliance: unhandled error', err)
    return NextResponse.json({ error: 'Could not read that document. Enter the details by hand instead.' }, { status: 500 })
  }
}
