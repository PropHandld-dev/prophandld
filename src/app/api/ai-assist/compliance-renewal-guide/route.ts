import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 30

// "How do I actually renew this" for one specific tracked compliance item
// — compliance-gap-check already flags what's missing, this is the next
// step once something's on the list and coming due. Grounded in the real
// item type, expiry date, and property location already on file (no need
// to ask the landlord to re-explain any of that), plus the same verified
// Philadelphia Safe Healthy Homes Act facts already sourced from real
// legal coverage elsewhere in the app (landing page's own comment), not
// re-derived from memory here. Outside Philadelphia, the model leans on
// its own general real-estate-compliance knowledge rather than a hardcoded
// fact sheet — deliberately broad, not narrowed to one city, per the
// explicit call to maximize what this can actually help with.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords can use Prophandld AI' }, { status: 403 })
  }

  const { complianceItemId } = (await request.json()) as { complianceItemId?: string }
  if (!complianceItemId) {
    return NextResponse.json({ error: 'Missing complianceItemId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: item } = await supabaseAdmin
    .from('compliance_items')
    .select('item_type, expiry_date, property_id, properties(address, city, state, owner_user_id)')
    .eq('id', complianceItemId)
    .maybeSingle()
  const property: any = (item as any)?.properties
  if (!item || !property || property.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'Compliance item not found' }, { status: 404 })
  }
  if (!(await hasAiAssistAccess(supabaseAdmin, user.id))) {
    return NextResponse.json({ error: 'Prophandld AI is not active on this account' }, { status: 403 })
  }
  if (await tooManyAiAssistRequests('compliance-renewal-guide', user.id, 20)) {
    return NextResponse.json({ error: 'Too many requests right now, try again in a few minutes.' }, { status: 429 })
  }

  const isPhiladelphia = (property.city || '').trim().toLowerCase() === 'philadelphia'

  try {
    const result = await claudeJson<{ guide: string }>({
      system:
        'You help a residential landlord understand how to actually renew one specific compliance/licensing item ' +
        'for a rental property, for a property management app. This is informational only, not legal advice. ' +
        'Give clear, genuinely useful, step-by-step guidance (who typically handles this, what\'s typically ' +
        'required, the usual process) using your real general knowledge of how this kind of renewal works in ' +
        'the US — don\'t default to vague hand-waving. But never state a specific current fee, exact form ' +
        'number, or exact deadline as guaranteed fact unless you\'re genuinely confident it\'s stable; when ' +
        'you\'re not sure of an exact current number, say so plainly and tell them to confirm it with the ' +
        'relevant local authority instead of inventing one. 4-7 sentences, plain language, no markdown.' +
        (isPhiladelphia
          ? ' This property is in Philadelphia, PA — you can be more specific here: Philadelphia rental ' +
            'licenses are administered by the Department of Licenses & Inspections (L&I). Under the Safe ' +
            'Healthy Homes Act (effective November 1, 2026), a cited violation must be fixed within 30 days ' +
            'before a license can be suspended, and a suspended license means rent legally can\'t be collected ' +
            'until it\'s resolved. Mention L&I by name and point them to the official L&I site for the current ' +
            'online renewal process, since exact portal/fee details change.'
          : ''),
      prompt:
        `Compliance item: ${item.item_type}\n` +
        `Expires: ${item.expiry_date || 'no date on file'}\n` +
        `Property: ${property.address}, ${property.city || 'unknown city'}, ${property.state || 'unknown state'}\n\n` +
        'Return JSON: { "guide": string } — the renewal guidance as described.',
      maxTokens: 600,
      track: { billedUserId: user.id, callerUserId: user.id, feature: 'compliance-renewal-guide' },
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      return NextResponse.json({ error: 'This isn’t set up yet.' }, { status: 503 })
    }
    console.error('ai-assist/compliance-renewal-guide: unhandled error', err)
    return NextResponse.json({ error: 'Could not look that up right now.', _debug: err instanceof Error ? err.message : String(err) } as any, { status: 500 })
  }
}
