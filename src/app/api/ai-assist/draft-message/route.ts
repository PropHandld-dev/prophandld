import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 30

type Kind = 'late_rent' | 'access_notice' | 'renewal_offer'

// Landlord-only, and the landlord is the one AI Assist is billed to here —
// no cross-role lookup needed, unlike lease-qa/troubleshoot/polish-bid.
// Drafts from the real tenant/unit/lease data already on file; the
// landlord reviews it in the chat input and can edit freely before
// sending, this route never sends a message itself.
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
  if (await tooManyAiAssistRequests('draft-message', user.id, 20)) {
    return NextResponse.json({ error: 'Too many drafts right now, try again in a few minutes.' }, { status: 429 })
  }

  const { renterUserId, kind } = (await request.json()) as { renterUserId?: string; kind?: Kind }
  if (!renterUserId || !kind || !['late_rent', 'access_notice', 'renewal_offer'].includes(kind)) {
    return NextResponse.json({ error: 'Missing or invalid renterUserId/kind' }, { status: 400 })
  }

  // Scoped to a tenancy on a unit this landlord actually owns — never lets
  // a landlord draft a message "about" a renter they have no real
  // tenancy relationship with, even though they could DM anyone.
  const { data: tenancy } = await supabaseAdmin
    .from('tenancies')
    .select('*, units(unit_number, properties(address, owner_user_id))')
    .eq('renter_user_id', renterUserId)
    .eq('ended', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const property: any = (tenancy as any)?.units?.properties
  if (!tenancy || !property || property.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'No active tenancy found for this renter on one of your properties.' }, { status: 404 })
  }

  const { data: renter } = await supabaseAdmin.from('users').select('full_name').eq('id', renterUserId).maybeSingle()
  const unitLabel = (tenancy as any).units?.unit_number ? `${property.address}, Unit ${(tenancy as any).units.unit_number}` : property.address

  const facts = {
    tenant_name: renter?.full_name || 'the tenant',
    unit: unitLabel,
    monthly_rent: tenancy.rent_amount,
    rent_due_day: tenancy.rent_due_day,
    late_fee_amount: tenancy.late_fee_amount,
    grace_period_days: tenancy.grace_period_days,
    lease_end: tenancy.lease_end,
    rent_escalation_percent: tenancy.escalation_percent,
  }

  const kindInstruction: Record<Kind, string> = {
    late_rent:
      'Draft a reminder that rent is late. Friendly, not accusatory, no threats — state the facts (rent amount, ' +
      'due day) and offer to work something out if there\'s an issue. Mention the late fee only if one is on file ' +
      'and it hasn\'t been charged yet, phrased as information not a threat.',
    access_notice:
      'Draft a notice that the landlord (or someone on their behalf) needs to access the unit soon, for a routine ' +
      'reason (repair, inspection, showing). Ask the tenant to confirm a time works or suggest an alternative. ' +
      'Don\'t invent a specific date/time, leave a placeholder like "[date/time]" for the landlord to fill in.',
    renewal_offer:
      'Draft a lease renewal offer. Reference the actual lease end date and current rent, and leave the new ' +
      'proposed rent as a placeholder like "[new rent amount]" for the landlord to fill in since that\'s their ' +
      'decision to make, not something to guess.',
  }

  try {
    const result = await claudeJson<{ message: string }>({
      system:
        'You draft a short message from a landlord to their tenant, through a property management app\'s chat. ' +
        'Plain, warm but professional language, 3-5 sentences, no markdown, no subject line, ready to send as a ' +
        'single chat message. Use the real facts provided, never invent specifics not given.',
      prompt: `${kindInstruction[kind]}\n\nFacts (JSON, null means not on file): ${JSON.stringify(facts)}\n\nReturn JSON: { "message": string }`,
      // A 3-5 sentence drafted message is the same scope that needed
      // raising elsewhere today (troubleshoot's DIY tips) after 400
      // turned out to truncate mid-sentence — bumped proactively here
      // rather than waiting for the same failure to get reported again.
      maxTokens: 600,
      track: { billedUserId: user.id, callerUserId: user.id, feature: 'draft-message' },
    })

    return NextResponse.json({ draft: result.message })
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      console.error('ai-assist/draft-message: Claude not configured', err)
      return NextResponse.json({ error: 'This isn’t set up yet.' }, { status: 503 })
    }
    console.error('ai-assist/draft-message: unhandled error', err)
    return NextResponse.json({ error: 'Could not draft that right now. Try again in a moment.' }, { status: 500 })
  }
}
