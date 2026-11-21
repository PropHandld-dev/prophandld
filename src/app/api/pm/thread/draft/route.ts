import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { claudeText } from '@/lib/claude'
import { resolvePair } from '@/lib/pmThread'

export const maxDuration = 30

const OPEN = ['pending_approval', 'bidding', 'approved', 'bid_selected', 'scheduled', 'in_progress', 'pending_review']
// Plain words for the owner. Raw "pending approval" read as "waiting for
// YOUR approval", but those are new requests the manager is reviewing.
const STATUS_WORDS: Record<string, string> = {
  pending_approval: 'new request, we are reviewing it',
  approved: 'approved, about to go out for bids',
  bidding: 'collecting contractor bids',
  bid_selected: 'contractor chosen',
  scheduled: 'visit scheduled',
  in_progress: 'work underway',
  pending_review: 'finished, we are checking the work',
}

// POST { owner?, mode: 'update' | 'reply' | 'polish', draft?, instruction? }
//  update: a status update to the owner from real data (PM side)
//  reply:  a reply to the latest message (either side)
//  polish: rewrite the caller's own draft (either side)
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const b = (await request.json().catch(() => ({}))) as { owner?: string; mode?: string; draft?: string; instruction?: string }
  const pair = await resolvePair(admin, user.id, b.owner || null)
  if (!pair) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  const billed = pair.side === 'owner' ? user.id : pair.ownerUserId
  if (!(await hasAiAssistAccess(admin, billed)) && !(await hasAiAssistAccess(admin, user.id))) {
    return NextResponse.json({ error: 'Prophandld AI is not turned on for this account.', needsAi: true }, { status: 402 })
  }
  if (await tooManyAiAssistRequests('pm-thread-draft', user.id, 30)) {
    return NextResponse.json({ error: 'Too many AI requests. Try again in a few minutes.' }, { status: 429 })
  }
  const mode = b.mode === 'reply' || b.mode === 'polish' ? b.mode : 'update'
  if (mode === 'update' && pair.side !== 'pm') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const draft = typeof b.draft === 'string' ? b.draft.slice(0, 2000) : ''
  const instruction = typeof b.instruction === 'string' ? b.instruction.slice(0, 300) : ''
  if (mode === 'polish' && !draft.trim()) return NextResponse.json({ error: 'Write something first' }, { status: 400 })

  const [{ data: owner }, { data: me }, { data: recent }] = await Promise.all([
    admin.from('users').select('full_name').eq('id', pair.ownerUserId).maybeSingle(),
    admin.from('users').select('full_name').eq('id', user.id).maybeSingle(),
    admin
      .from('pm_owner_messages')
      .select('sender_side, body, kind, action_status, created_at')
      .eq('organization_id', pair.organizationId)
      .eq('owner_user_id', pair.ownerUserId)
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const facts: string[] = []
  if (mode === 'update') {
    const { data: props } = await admin.from('properties').select('id, address').eq('owner_user_id', pair.ownerUserId).eq('archived', false)
    const propIds = (props || []).map((p: any) => p.id)
    const addr = new Map((props || []).map((p: any) => [p.id, p.address]))
    const { data: units } = propIds.length ? await admin.from('units').select('id, property_id, unit_number').in('property_id', propIds) : { data: [] }
    const unitIds = (units || []).map((u: any) => u.id)
    const unitAddr = new Map((units || []).map((u: any) => [u.id, `${addr.get(u.property_id)}${u.unit_number && u.unit_number !== 'Main' ? ` unit ${u.unit_number}` : ''}`]))
    const monthStart = new Date()
    monthStart.setDate(1)
    const since = new Date(Date.now() - 30 * 86400000).toISOString()
    const [{ data: openJobs }, { data: doneJobs }, { data: tenancies }] = await Promise.all([
      unitIds.length ? admin.from('jobs').select('category, status, unit_id').in('unit_id', unitIds).in('status', OPEN).limit(15) : Promise.resolve({ data: [] as any[] }),
      unitIds.length ? admin.from('jobs').select('category, unit_id, contractor_completed_at').in('unit_id', unitIds).eq('status', 'completed').gte('contractor_completed_at', since).limit(10) : Promise.resolve({ data: [] as any[] }),
      unitIds.length ? admin.from('tenancies').select('id').in('unit_id', unitIds).eq('ended', false) : Promise.resolve({ data: [] as any[] }),
    ])
    const tIds = (tenancies || []).map((t: any) => t.id)
    const { data: rents } = tIds.length
      ? await admin.from('rent_payments').select('expected_amount, actual_amount').in('tenancy_id', tIds).eq('month', monthStart.toLocaleDateString('en-CA').slice(0, 8) + '01')
      : { data: [] }
    const expected = (rents || []).reduce((t: number, r: any) => t + Number(r.expected_amount || 0), 0)
    const collected = (rents || []).reduce((t: number, r: any) => t + Math.min(Number(r.actual_amount || 0), Number(r.expected_amount || 0)), 0)
    facts.push(`Properties: ${(props || []).map((p: any) => p.address).join('; ') || 'none'}`)
    facts.push(`Rent this month: $${collected.toFixed(2)} collected of $${expected.toFixed(2)} due across ${tIds.length} active lease(s).`)
    facts.push(`Open maintenance: ${(openJobs || []).map((j: any) => `${j.category} at ${unitAddr.get(j.unit_id)} (${STATUS_WORDS[j.status] || String(j.status).replace(/_/g, ' ')})`).join('; ') || 'none'}`)
    facts.push(`Finished in the last 30 days: ${(doneJobs || []).map((j: any) => `${j.category} at ${unitAddr.get(j.unit_id)}`).join('; ') || 'none'}`)
  }
  const conversation = (recent || [])
    .reverse()
    .map((m: any) => `${m.sender_side === 'pm' ? pair.orgName : owner?.full_name || 'Owner'}: ${m.kind === 'approval' ? `[approval request, ${m.action_status}] ` : ''}${m.body}`)
    .join('\n')

  const writer = pair.side === 'pm' ? `${me?.full_name || 'a property manager'} at ${pair.orgName}` : `${owner?.full_name || 'the owner'}, a property owner`
  const reader = pair.side === 'pm' ? `${owner?.full_name || 'the owner'}, their client` : `${pair.orgName}, their property manager`
  try {
    const raw = await claudeText({
      system:
        `You draft short messages for ${writer}, writing to ${reader}, inside a property management app. ` +
        'Warm, clear, professional, plain language; no subject line, no sign-off block, no emojis. ' +
        'Use ONLY the facts provided. Never invent amounts, dates, names, or events. If something is unknown, leave it out. ' +
        'Keep it under 120 words unless asked otherwise. Match the language of the conversation (English or Spanish).',
      prompt:
        (mode === 'update'
          ? `Write a brief status update for the owner.\nFacts:\n${facts.join('\n')}`
          : mode === 'reply'
            ? 'Write a reply to the latest message in the conversation.'
            : `Rewrite this draft to read better, keeping its meaning and every fact as-is:\n"""${draft}"""`) +
        (conversation ? `\n\nRecent conversation:\n${conversation}` : '') +
        (instruction ? `\n\nExtra instruction from the writer: ${instruction}` : ''),
      maxTokens: 800,
      track: { billedUserId: billed, callerUserId: user.id, feature: 'pm-thread-draft' },
    })
    const text = raw.slice(0, 4000)
    if (!text) throw new Error('empty')
    return NextResponse.json({ text })
  } catch (err) {
    console.error('pm/thread/draft: failed', err)
    return NextResponse.json({ error: 'Could not draft that right now. Try again.' }, { status: 500 })
  }
}
