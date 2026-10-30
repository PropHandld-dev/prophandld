import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 60

type ApplianceExtraction = { brand: string | null; model: string | null; install_date: string | null }

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

// Same capability as lease/compliance extraction, applied to a photo of an
// appliance's metal nameplate or sticker — reads brand/model/install date
// instead of the landlord typing them in by hand. Nameplates almost never
// have a true "manufactured" date distinct from install, so install_date
// is only ever filled if the photo is clearly a receipt/install sticker
// with a real install date on it, not guessed from a manufacture date.
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
  if (await tooManyAiAssistRequests('extract-appliance', user.id, 20)) {
    return NextResponse.json({ error: 'Too many uploads right now, try again in a few minutes.' }, { status: 429 })
  }

  const { fileBase64, mediaType } = (await request.json()) as { fileBase64?: string; mediaType?: string }
  if (!fileBase64 || !mediaType || !ALLOWED_MEDIA_TYPES.includes(mediaType)) {
    return NextResponse.json({ error: 'Upload a JPG or PNG photo.' }, { status: 400 })
  }

  try {
    const result = await claudeJson<ApplianceExtraction>({
      system:
        'You read a photo of an appliance or equipment nameplate/sticker (water heater, HVAC unit, etc.) for a ' +
        'property management app. Only report a value clearly visible in the photo, use null for anything not ' +
        'legible or not present. install_date must be a full YYYY-MM-DD date — if only a year or partial date is ' +
        'visible, use null rather than guessing a month/day, and only fill it from an actual install/service ' +
        'sticker, never guessed from a manufacture date code.',
      prompt: 'Return JSON with exactly these keys: brand (string|null), model (string|null), install_date (string|null).',
      file: { base64: fileBase64, mediaType: mediaType as any },
      maxTokens: 150,
      track: { billedUserId: user.id, callerUserId: user.id, feature: 'appliance-extraction' },
    })
    return NextResponse.json({ extracted: result })
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      console.error('ai-assist/extract/appliance: Claude not configured', err)
      return NextResponse.json({ error: 'AI reading is not set up yet.' }, { status: 503 })
    }
    console.error('ai-assist/extract/appliance: unhandled error', err)
    return NextResponse.json({ error: 'Could not read that photo. Enter the details by hand instead.' }, { status: 500 })
  }
}
