import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 30

type FirstPass = { done: boolean; question?: string; resolved?: boolean; message?: string }
type SecondPass = { resolved: boolean; message: string }
type KnownAppliance = { name?: string; brand?: string | null; model?: string | null }

// Two shapes of call to the same route: no previousQuestion yet means
// "should we even ask a troubleshooting question, and if so what" — a
// previousQuestion + answer means "did that resolve it." Shared by the
// renter's report flow and the landlord's "Handle it myself" flow — same
// AI, same safety boundaries, same disclaimers, regardless of who's asking
// (a landlord isn't a licensed contractor either, so there's no reason to
// loosen anything for them). The caller never calls this at all for an
// emergency or electrical/gas category — this route also independently
// refuses those categories as defense in depth, in case a client-side
// check is ever bypassed.
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

  const { category, description, isEmergency, knownAppliance, previousQuestion, previousAnswer } = (await request.json()) as {
    category?: string
    description?: string
    isEmergency?: boolean
    knownAppliance?: KnownAppliance
    previousQuestion?: string
    previousAnswer?: string
  }

  if (!category || !description?.trim()) {
    return NextResponse.json({ error: 'Missing category or description' }, { status: 400 })
  }
  if (isEmergency || NO_TROUBLESHOOT_CATEGORIES.some((c) => category.toLowerCase().includes(c.toLowerCase()))) {
    return NextResponse.json({ done: true, resolved: false, message: '' } as FirstPass)
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
    return NextResponse.json({ done: true, resolved: false, message: '' } as FirstPass)
  }
  if (await tooManyAiAssistRequests('troubleshoot', user.id, 20)) {
    return NextResponse.json({ done: true, resolved: false, message: '' } as FirstPass)
  }

  // Never passed to the model before — a Spanish-preferring renter got
  // English troubleshooting questions regardless of their setting, the
  // one AI Assist route that missed this (help-chat, lease-qa both
  // already do it).
  const { data: profile } = await supabaseAdmin.from('users').select('preferred_language').eq('id', user.id).maybeSingle()
  const lang = profile?.preferred_language === 'es' ? 'Spanish' : 'English'
  const fallbackMessage = lang === 'Spanish' ? 'No hay nada más que revisar aquí, puedes reportarlo.' : "Nothing extra to check here, go ahead and report it."

  // Audience-dependent phrasing only — the safety rules themselves (what's
  // safe to ask/suggest) are identical for both. A landlord already has
  // the job in hand (deciding whether to still open it for bidding), a
  // renter is about to create one.
  const audience = role === 'landlord'
    ? "a landlord who is about to try fixing a maintenance issue themselves before deciding whether to hire a contractor, for a property management app. The landlord is not a licensed contractor either — don't assume more skill or tools than a renter would have"
    : 'a renter quickly troubleshoot a reported maintenance issue before it gets posted as a job for a contractor, for a property management app'
  const reportingAction = role === 'landlord'
    ? 'open the job for contractor bidding'
    : 'post it'
  const knownApplianceLine = knownAppliance?.name
    ? `\nTracked appliance on file for this unit: ${knownAppliance.name}${knownAppliance.brand ? `, brand ${knownAppliance.brand}` : ''}${knownAppliance.model ? `, model ${knownAppliance.model}` : ''} — already known, don't ask for it again.`
    : ''

  try {
    if (!previousQuestion) {
      const result = await claudeJson<FirstPass>({
        system:
          `You help ${audience}. Only ask about safe, reversible checks ` +
          'they can do themselves (is it plugged in, is a valve or switch in the right position, has it been ' +
          'reset) — never anything touching electrical wiring, gas lines, or that could cause damage or injury ' +
          'if attempted. If the issue genuinely has no safe self-check worth trying (e.g. a broken fixture, a ' +
          `structural issue, anything already described as serious), skip straight to recommending they ${reportingAction}. ` +
          'If this is an appliance (refrigerator, oven/stove, dishwasher, washer/dryer, microwave), the brand or ' +
          'model isn\'t already known, and the description doesn\'t already say it, work that into your one ' +
          'question too — specific guidance later is much more useful with it (e.g. "What brand is the ' +
          'dishwasher, and is the door latching all the way?"). ' +
          `Ask at most ONE combined question, 1-2 short sentences, plain language. Respond in ${lang}.`,
        prompt:
          `Category: ${category}\nDescription: ${description.trim()}${knownApplianceLine}\n\n` +
          'Return JSON: either { "done": false, "question": string } if there is one worthwhile thing to check, ' +
          'or { "done": true, "resolved": false, "message": string } (a short, friendly one-sentence note) if ' +
          'this should just be posted as-is.',
        maxTokens: 350,
        track: { billedUserId: landlordUserId, callerUserId: user.id, feature: 'troubleshoot' },
      })
      // The model doesn't always follow the "short, friendly note" part of
      // the instructions even when it correctly decides there's nothing
      // worth checking — caught live via an empty message string. The UI
      // treats any empty message as "skip troubleshooting with zero
      // feedback," which looks exactly like tapping "Try it" did nothing,
      // worse than never offering it at all. A plain fallback keeps that
      // real, useful "done: true, resolved: false" case from going silent.
      if (result.done && !result.resolved && !result.message) {
        result.message = fallbackMessage
      }
      return NextResponse.json(result)
    }

    const result = await claudeJson<SecondPass>({
      system:
        `You are finishing a short troubleshooting exchange with ${role === 'landlord' ? 'a landlord' : 'a renter'} ` +
        'about a maintenance issue, for a property management app. Based on their answer, decide if the issue ' +
        'sounds resolved or still needs a contractor. If it does NOT sound resolved and this is the kind of issue ' +
        'with real, well-known, genuinely safe things to try (e.g. a dishwasher not draining because of a clogged ' +
        'filter, a washer not spinning because it\'s overloaded or unbalanced, a fridge not cooling because vents ' +
        'are blocked or coils need dusting, a dryer not heating because the lint trap or vent is clogged), include ' +
        'up to 2-3 short steps, plain language, as part of the message. Never suggest opening the appliance\'s ' +
        'housing or casing, touching any internal or electrical parts, working with a gas line or connection, or ' +
        'anything needing tools beyond what\'s already in a kitchen or closet — if the issue doesn\'t have a real ' +
        'safe thing to try, don\'t force one, just say so plainly. Always make clear these are general tips, not ' +
        `a guarantee, that it's completely fine to skip straight to having a contractor look, and that they should ${reportingAction} ` +
        'either way so it\'s on record regardless. Keep the message short either way, and write it as ONE flowing ' +
        'paragraph of plain sentences, no line breaks, no bullet points or numbered lists, no markdown — separate ' +
        'multiple tips inline with words like "first" / "also" / "and" rather than putting each on its own line, ' +
        `since the message must be valid JSON as a single plain string. Respond in ${lang}.`,
      prompt:
        `Category: ${category}\nDescription: ${description.trim()}${knownApplianceLine}\nQuestion asked: ${previousQuestion}\n` +
        `Answer: ${previousAnswer || ''}\n\n` +
        'Return JSON: { "resolved": boolean, "message": string }',
      // Confirmed live: 400 wasn't enough headroom once the message could
      // include a few DIY tips plus the required disclaimer — the model's
      // raw output was getting cut off mid-sentence, which produces
      // truncated, invalid JSON (not a formatting problem, an actual
      // length one). 700 gives real room without being wasteful for the
      // common case where there's nothing extra to say at all.
      maxTokens: 700,
      track: { billedUserId: landlordUserId, callerUserId: user.id, feature: 'troubleshoot' },
    })
    if (!result.message) result.message = fallbackMessage
    return NextResponse.json({ done: true, ...result } as FirstPass)
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      console.error('ai-assist/troubleshoot: Claude not configured', err)
      return NextResponse.json({ done: true, resolved: false, message: fallbackMessage } as FirstPass)
    }
    // Most commonly the model's raw output failing claudeJson's JSON.parse
    // (logged there with the raw text) — confirmed live as the actual
    // cause of the empty-message bug this file's fallbackMessage exists
    // for, not just a defensive "might happen someday" case. Never block
    // the actual report over this failing either way — fail open straight
    // to "just post it", same as the category/emergency skip above.
    console.error('ai-assist/troubleshoot: unhandled error', err)
    return NextResponse.json({ done: true, resolved: false, message: fallbackMessage } as FirstPass)
  }
}
