import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 30

type FirstPass = { done: boolean; question?: string; resolved?: boolean; message?: string }
type SecondPass = { resolved: boolean; message: string }

// Two shapes of call to the same route: no previousQuestion yet means
// "should we even ask a troubleshooting question, and if so what" — a
// previousQuestion + answer means "did that resolve it." Renter-facing,
// gated on the landlord's AI Assist status (see lease-qa/route.ts for the
// same pattern and why). The caller (renter/report/page.tsx) never calls
// this at all for an emergency or electrical/gas category — this route
// also independently refuses those categories as defense in depth, in
// case a client-side check is ever bypassed.
const NO_TROUBLESHOOT_CATEGORIES = ['Electrical', 'Gas', 'Structural']

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'renter') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  const { category, description, isEmergency, previousQuestion, previousAnswer } = (await request.json()) as {
    category?: string
    description?: string
    isEmergency?: boolean
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
  const landlordUserId = (unit as any)?.properties?.owner_user_id
  if (!landlordUserId || !(await hasAiAssistAccess(supabaseAdmin, landlordUserId))) {
    return NextResponse.json({ done: true, resolved: false, message: '' } as FirstPass)
  }

  try {
    if (!previousQuestion) {
      const result = await claudeJson<FirstPass>({
        system:
          'You help a renter quickly troubleshoot a reported maintenance issue before it gets posted as a job ' +
          'for a contractor, for a property management app. Only ask about safe, reversible checks a renter ' +
          'can do themselves (is it plugged in, is a valve or switch in the right position, has it been ' +
          'reset) — never anything touching electrical wiring, gas lines, or that could cause damage or injury ' +
          'if attempted. If the issue genuinely has no safe self-check worth trying (e.g. a broken fixture, a ' +
          'structural issue, anything already described as serious), skip straight to recommending it be posted. ' +
          'Ask at most ONE combined question, 1-2 short sentences, plain language.',
        prompt:
          `Category: ${category}\nDescription: ${description.trim()}\n\n` +
          'Return JSON: either { "done": false, "question": string } if there is one worthwhile thing to check, ' +
          'or { "done": true, "resolved": false, "message": string } (a short, friendly one-sentence note) if ' +
          'this should just be posted as-is.',
        maxTokens: 300,
        track: { billedUserId: landlordUserId, callerUserId: user.id, feature: 'troubleshoot' },
      })
      return NextResponse.json(result)
    }

    const result = await claudeJson<SecondPass>({
      system:
        'You are finishing a short troubleshooting exchange with a renter about a maintenance issue, for a ' +
        'property management app. Based on their answer, decide if the issue sounds resolved or still needs a ' +
        'contractor. Keep the message to one short, friendly sentence.',
      prompt:
        `Category: ${category}\nDescription: ${description.trim()}\nQuestion asked: ${previousQuestion}\n` +
        `Renter's answer: ${previousAnswer || ''}\n\n` +
        'Return JSON: { "resolved": boolean, "message": string }',
      maxTokens: 200,
      track: { billedUserId: landlordUserId, callerUserId: user.id, feature: 'troubleshoot' },
    })
    return NextResponse.json({ done: true, ...result } as FirstPass)
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      console.error('ai-assist/troubleshoot: Claude not configured', err)
      return NextResponse.json({ done: true, resolved: false, message: '' } as FirstPass)
    }
    console.error('ai-assist/troubleshoot: unhandled error', err)
    // Never block the actual report over this failing — fail open straight
    // to "just post it", same as the category/emergency skip above.
    return NextResponse.json({ done: true, resolved: false, message: '' } as FirstPass)
  }
}
