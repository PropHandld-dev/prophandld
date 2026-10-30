import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 60

type TenancyExtraction = {
  rent_amount: number | null
  rent_due_day: number | null
  lease_start: string | null
  lease_end: string | null
  security_deposit: number | null
  escalation_percent: number | null
  escalation_frequency_months: number | null
  occupants: number | null
  pets: string | null
}

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']

// The tenancy form (see the AI Features Proposal PDF, "Grounded in the real
// app") is the single richest manual-entry screen in the whole app — every
// one of these fields is typed by hand today with no document upload on
// the form at all, even though the real lease already has every number.
// This reads the uploaded lease once and returns exactly the fields the
// form already has; the landlord reviews in the form itself before saving,
// nothing here ever writes to the database directly.
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

  const { fileBase64, mediaType } = (await request.json()) as { fileBase64?: string; mediaType?: string }
  if (!fileBase64 || !mediaType || !ALLOWED_MEDIA_TYPES.includes(mediaType)) {
    return NextResponse.json({ error: 'Upload a PDF, JPG, or PNG of the lease.' }, { status: 400 })
  }

  try {
    const result = await claudeJson<TenancyExtraction>({
      system:
        'You read residential lease documents and extract specific fields for a property management app. ' +
        'Only report a value you can actually find stated in the document — if something is not clearly ' +
        'present, use null rather than guessing or inferring a typical value. Dates must be in YYYY-MM-DD ' +
        'format. Money amounts are plain numbers with no currency symbol. pets is a short plain-text summary ' +
        '(e.g. "1 cat, $300 deposit") or null if the lease says no pets or does not mention pets.',
      prompt:
        'Extract these fields from the attached lease document and return them as JSON with exactly these keys: ' +
        'rent_amount (number|null), rent_due_day (integer 1-28|null), lease_start (date|null), lease_end (date|null), ' +
        'security_deposit (number|null), escalation_percent (number|null, the rent increase percentage per escalation period, ' +
        'if the lease has a rent escalation/increase clause), escalation_frequency_months (integer|null, how often the ' +
        'escalation applies, e.g. 12 for annually), occupants (integer|null, the number of listed occupants/tenants), ' +
        'pets (string|null).',
      file: { base64: fileBase64, mediaType: mediaType as any },
      maxTokens: 512,
      track: { billedUserId: user.id, callerUserId: user.id, feature: 'lease-extraction' },
    })

    return NextResponse.json({ extracted: result })
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      console.error('ai-assist/extract/tenancy: Claude not configured', err)
      return NextResponse.json({ error: 'AI reading is not set up yet.' }, { status: 503 })
    }
    console.error('ai-assist/extract/tenancy: unhandled error', err)
    return NextResponse.json({ error: 'Could not read that document. Try again, or enter the details by hand.' }, { status: 500 })
  }
}
