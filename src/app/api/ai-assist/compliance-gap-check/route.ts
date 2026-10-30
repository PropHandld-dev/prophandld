import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 30

type Suggestion = { itemType: string; why: string }

// Compliance tracking today is purely reactive (you type in an item, it
// reminds you before it expires) — this flips it around and proactively
// suggests commonly-required items a landlord hasn't added yet for their
// property's city/state, something no compliance-tracking feature on any
// competing platform does. Always framed as "worth checking," never a
// confident legal claim — requirements genuinely vary by city and change
// over time, same "informational, not legal advice" posture as lease Q&A.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords can use AI Assist' }, { status: 403 })
  }

  const { propertyId } = (await request.json()) as { propertyId?: string }
  if (!propertyId) {
    return NextResponse.json({ error: 'Missing propertyId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: property } = await supabaseAdmin
    .from('properties')
    .select('city, state, owner_user_id')
    .eq('id', propertyId)
    .maybeSingle()
  if (!property || property.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }
  if (!(await hasAiAssistAccess(supabaseAdmin, user.id))) {
    return NextResponse.json({ error: 'AI Assist is not active on this account' }, { status: 403 })
  }
  if (await tooManyAiAssistRequests('compliance-gap-check', user.id, 20)) {
    return NextResponse.json({ error: 'Too many checks right now, try again in a few minutes.' }, { status: 429 })
  }

  const { data: existing } = await supabaseAdmin.from('compliance_items').select('item_type').eq('property_id', propertyId)
  const existingTypes = (existing || []).map((i) => i.item_type)

  try {
    const result = await claudeJson<{ suggestions: Suggestion[] }>({
      system:
        'You suggest compliance/licensing items a residential landlord in a specific US city/state commonly ' +
        'needs to track, for a property management app. This is informational only, not legal advice — every ' +
        'suggestion must be phrased as "worth checking with your city/state" rather than a confident claim, ' +
        'since requirements vary by municipality and change over time. Only suggest items you have real general ' +
        'knowledge of as common for that area; if you\'re not confident about the specific location, suggest ' +
        'generally common US rental-property items instead (smoke/CO detectors, a rental license, lead paint ' +
        'disclosure if pre-1978 construction) rather than guessing at hyper-local rules. Never suggest an item ' +
        'already in their tracked list. Cap it at 3 suggestions, most relevant first.',
      prompt:
        `Property location: ${property.city || 'unknown city'}, ${property.state || 'unknown state'}\n` +
        `Already tracked: ${existingTypes.length > 0 ? existingTypes.join(', ') : 'nothing yet'}\n\n` +
        'Return JSON: { "suggestions": [{ "itemType": string, "why": string }] } — itemType is a short name ' +
        '(e.g. "Rental License"), why is one short sentence on why it\'s commonly required.',
      maxTokens: 400,
      track: { billedUserId: user.id, callerUserId: user.id, feature: 'compliance-gap-check' },
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      return NextResponse.json({ error: 'This isn’t set up yet.' }, { status: 503 })
    }
    console.error('ai-assist/compliance-gap-check: unhandled error', err)
    return NextResponse.json({ error: 'Could not check that right now.' }, { status: 500 })
  }
}
