import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 20

// A quick check before a landlord-posted job goes live for bidding —
// flags a thin description or an obvious missing detail so contractors
// see fewer jobs they can't confidently bid on. Never blocks posting,
// only suggests; "Post anyway" always works regardless of the answer.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ ready: true })
  }

  const supabaseAdmin = getSupabaseAdmin()
  if (!(await hasAiAssistAccess(supabaseAdmin, user.id))) {
    return NextResponse.json({ ready: true })
  }
  if (await tooManyAiAssistRequests('job-ready-check', user.id, 40)) {
    return NextResponse.json({ ready: true })
  }

  const { category, description, hasPhoto } = (await request.json()) as {
    category?: string
    description?: string
    hasPhoto?: boolean
  }
  if (!category || !description?.trim()) {
    return NextResponse.json({ ready: true })
  }

  try {
    const result = await claudeJson<{ ready: boolean; suggestion: string | null }>({
      system:
        'You do a quick pre-publish check on a maintenance job description before it goes live for contractors ' +
        'to bid on, for a property management app. Only flag something if it would genuinely leave a contractor ' +
        'unable to bid confidently (too vague to know the scope, missing an obviously relevant detail for that ' +
        'category). Don\'t nitpick fine writing, a short-but-clear description is fine. Be generous — most ' +
        'descriptions should pass. For a category where a contractor would normally want to SEE the problem to ' +
        'bid confidently (visible damage, a leak, a stain, anything about appearance or extent of damage) and no ' +
        'photo is attached, that absence alone is worth flagging even if the text itself reads fine — say so ' +
        'plainly in the suggestion. For a category where a photo wouldn\'t really change anything (no heat, a ' +
        'strange noise, a smell), don\'t ask for one just because it\'s missing.',
      prompt:
        `Category: ${category}\nDescription: ${description.trim()}\nHas a photo attached: ${hasPhoto ? 'yes' : 'no'}\n\n` +
        'Return JSON: { "ready": boolean, "suggestion": string|null } — suggestion is one short, friendly ' +
        'sentence only when ready is false, null otherwise.',
      maxTokens: 150,
      track: { billedUserId: user.id, callerUserId: user.id, feature: 'job-ready-check' },
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof ClaudeConfigError) return NextResponse.json({ ready: true })
    console.error('ai-assist/job-ready-check: unhandled error', err)
    return NextResponse.json({ ready: true })
  }
}
