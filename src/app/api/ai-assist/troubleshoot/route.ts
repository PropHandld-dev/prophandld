import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 30

type ChatTurn = { role: 'user' | 'assistant'; content: string }
type Reply = { reply: string; resolved: boolean }
type KnownAppliance = { name?: string; brand?: string | null; model?: string | null }
type PhotoInput = { base64: string; mediaType: string }

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

// An open-ended conversation, not a fixed one-question-then-done flow — a
// renter typing "I tried that, still broken" should get the NEXT thing to
// try, for as long as there's genuinely something safe left to suggest,
// same as how an actual AI chat behaves rather than a rigid wizard. Shared
// by the renter's report flow and the landlord's "Handle it myself" flow —
// same AI, same safety boundaries, same disclaimers, regardless of who's
// asking (a landlord isn't a licensed contractor either, so there's no
// reason to loosen anything for them). The caller never calls this at all
// for an emergency or electrical/gas category — this route also
// independently refuses those categories as defense in depth, in case a
// client-side check is ever bypassed.
const NO_TROUBLESHOOT_CATEGORIES = ['Electrical', 'Gas', 'Structural']

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const role = user.app_metadata?.role
  if (role !== 'renter' && role !== 'landlord') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  const { category, description, isEmergency, knownAppliance, photos, history, message } = (await request.json()) as {
    category?: string
    description?: string
    isEmergency?: boolean
    knownAppliance?: KnownAppliance
    photos?: PhotoInput[]
    history?: ChatTurn[]
    message?: string
  }
  // A photo is often far more informative than a typed description — "it's
  // sparking" vs. an actual photo of the outlet — so this is passed to
  // Claude as real image input, not just described in text. Capped at 2
  // and filtered to real image types regardless of what the client sent,
  // same defense-in-depth every other AI Assist upload route already uses.
  const validPhotos: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }[] = (photos || [])
    .filter((p): p is PhotoInput & { mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' } => !!p?.base64 && ALLOWED_PHOTO_TYPES.includes(p.mediaType))
    .slice(0, 2)

  if (!category || !description?.trim()) {
    return NextResponse.json({ error: 'Missing category or description' }, { status: 400 })
  }
  if (isEmergency || NO_TROUBLESHOOT_CATEGORIES.some((c) => category.toLowerCase().includes(c.toLowerCase()))) {
    return NextResponse.json({ reply: '', resolved: false } as Reply)
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Renter: billed to whichever landlord owns their unit. Landlord: billed
  // to themselves directly, no tenancy lookup needed.
  let landlordUserId: string | null = null
  if (role === 'renter') {
    const { data: tenancy } = await supabaseAdmin
      .from('tenancies')
      .select('unit_id')
      .eq('renter_user_id', user.id)
      .eq('ended', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!tenancy) {
      return NextResponse.json({ error: 'No active lease found on your account.' }, { status: 404 })
    }
    const { data: unit } = await supabaseAdmin
      .from('units')
      .select('properties(owner_user_id)')
      .eq('id', tenancy.unit_id)
      .maybeSingle()
    landlordUserId = (unit as any)?.properties?.owner_user_id || null
  } else {
    landlordUserId = user.id
  }
  if (!landlordUserId || !(await hasAiAssistAccess(supabaseAdmin, landlordUserId))) {
    return NextResponse.json({ reply: '', resolved: false } as Reply)
  }
  if (await tooManyAiAssistRequests('troubleshoot', user.id, 30)) {
    return NextResponse.json({ reply: '', resolved: false } as Reply)
  }

  const { data: profile } = await supabaseAdmin.from('users').select('preferred_language').eq('id', user.id).maybeSingle()
  const lang = profile?.preferred_language === 'es' ? 'Spanish' : 'English'
  const fallbackMessage = lang === 'Spanish' ? 'No hay nada más que revisar aquí, puedes reportarlo.' : "Nothing extra to check here, go ahead and report it."

  // Audience-dependent phrasing only — the safety rules themselves (what's
  // safe to suggest) are identical for both. A landlord already has the
  // job in hand (deciding whether to still open it for bidding), a renter
  // is about to create one.
  const audienceRole = role === 'landlord' ? 'a landlord' : 'a renter'
  const audienceNote = role === 'landlord'
    ? ' The landlord is about to try fixing this themselves before deciding whether to hire a contractor, and is not a licensed contractor either — don\'t assume more skill or tools than a renter would have.'
    : ''
  const reportingAction = role === 'landlord' ? 'open the job for contractor bidding' : 'report it'
  const knownApplianceLine = knownAppliance?.name
    ? `\nTracked appliance on file for this unit: ${knownAppliance.name}${knownAppliance.brand ? `, brand ${knownAppliance.brand}` : ''}${knownAppliance.model ? `, model ${knownAppliance.model}` : ''} — already known, don't ask for it again.`
    : ''

  const trimmedHistory = (history || []).slice(-12).filter((t) => t.role === 'user' || t.role === 'assistant')
  const conversation = [...trimmedHistory, ...(message?.trim() ? [{ role: 'user' as const, content: message.trim() }] : [])]
    .map((t) => `${t.role === 'user' ? (role === 'landlord' ? 'Landlord' : 'Renter') : 'Assistant'}: ${t.content}`)
    .join('\n')

  try {
    const result = await claudeJson<Reply>({
      system:
        `You decide what to say next in an ongoing troubleshooting exchange with ${audienceRole} who's trying ` +
        `to resolve a maintenance issue themselves, for a property management app, before it needs a ` +
        `contractor.${audienceNote} This can run several turns — don't just produce one question and stop. The ` +
        'reply you write should suggest ONE safe, reversible thing to check or try at a time (is it plugged in, ' +
        'is a valve or switch in the right position, has it been reset), or, once you\'ve seen their result, ' +
        'either suggest the next safe thing if that one didn\'t work, say it sounds resolved, or say plainly ' +
        `you're out of safe things to try and it's worth having them ${reportingAction} — whichever actually ` +
        'fits where the conversation is. Keep the reply short, 1-3 sentences, warm and plain, like a helpful ' +
        'coworker texting back, not a formal assistant. ' +
        'Never suggest anything touching electrical wiring, gas lines, or that could cause damage or injury if ' +
        'attempted, and if at ANY point in the conversation they describe something dangerous (sparking, a gas ' +
        `smell, a shock, smoke, visible damage getting worse), drop whatever you were suggesting and write a ` +
        `reply telling them to stop immediately, stay safe, and ${reportingAction} right away — that overrides ` +
        'everything else, including anything you already suggested trying. If the issue genuinely never has a ' +
        `safe self-check worth trying (e.g. a broken fixture, a structural issue, anything already described as ` +
        `serious), say so plainly up front and recommend they ${reportingAction} instead of forcing a question. ` +
        'If this is an appliance (refrigerator, oven/stove, dishwasher, washer/dryer, microwave) and the brand ' +
        'or model isn\'t already known and hasn\'t been said, it\'s fine to ask for it, but don\'t belabor it if ' +
        'they don\'t know. Always make clear nothing here is a guarantee and it\'s completely fine to stop and ' +
        `${reportingAction} at any point, whether or not they\'ve tried everything you suggested — you\'re not the ` +
        'only way this gets fixed. Set resolved: true only when their LATEST message actually indicates it\'s ' +
        'fixed now, not just that something sounds promising.' +
        (validPhotos.length ? ' A photo of the issue is attached — actually look at it and factor in what you can see.' : '') +
        ` Respond in ${lang}.\n\n` +
        'Output EXACTLY one JSON object and nothing else — no reply text before it, no repeated or paraphrased ' +
        'version of the reply after it, no commentary, just { "reply": string, "resolved": boolean } once.',
      prompt:
        `Category: ${category}\nDescription: ${description.trim()}${knownApplianceLine}\n\n` +
        (conversation ? `Conversation so far:\n${conversation}\n\n` : '(Nothing said yet — write your opening reply.)\n\n') +
        'Return JSON: { "reply": string, "resolved": boolean }.',
      files: validPhotos.length ? validPhotos : undefined,
      // Generous — a multi-turn conversation with real tips needs more
      // room than a single fixed question ever did. (The earlier failures
      // at 500 turned out to be the model writing the reply twice — once
      // as plain prose, once re-wrapped in JSON — not pure truncation, but
      // extra headroom is cheap insurance either way.)
      maxTokens: 600,
      track: { billedUserId: landlordUserId, callerUserId: user.id, feature: 'troubleshoot' },
    })
    if (!result.reply) result.reply = fallbackMessage
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      console.error('ai-assist/troubleshoot: Claude not configured', err)
      return NextResponse.json({ reply: fallbackMessage, resolved: false } as Reply)
    }
    // Most commonly the model's raw output failing claudeJson's JSON.parse
    // (logged there with the raw text) — confirmed live more than once as
    // the actual cause of a reply going silent, not just a defensive
    // "might happen someday" case. Never block the actual report over
    // this failing either way — fail open with a plain fallback that
    // still lets the conversation (or reporting) continue.
    console.error('ai-assist/troubleshoot: unhandled error', err)
    return NextResponse.json({ reply: fallbackMessage, resolved: false, _debug: err instanceof Error ? err.message : String(err) } as any)
  }
}
