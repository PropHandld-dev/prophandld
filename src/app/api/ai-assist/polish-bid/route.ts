import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 30

// Contractor-facing, gated on the JOB's landlord having AI Assist active —
// same cross-role pattern as lease-qa and troubleshoot (the add-on is
// billed to the landlord, everyone whose job touches that landlord's
// property gets the benefit of it). Rough shorthand in the notes field
// becomes a clear scope, same shape as the renter's smart-issue-reporting
// cleanup, opposite side of the marketplace.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'contractor') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  const { jobId, notes, notIncluded, amount, pricingType, laborRate, estimatedHours } = (await request.json()) as {
    jobId?: string
    notes?: string
    notIncluded?: string
    amount?: number
    pricingType?: 'fixed' | 'hourly'
    laborRate?: number | null
    estimatedHours?: number | null
  }

  if (!jobId || !notes?.trim() || !amount) {
    return NextResponse.json({ error: 'Missing job, notes, or amount' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('category, description, units(properties(owner_user_id))')
    .eq('id', jobId)
    .maybeSingle()
  const landlordUserId = (job as any)?.units?.properties?.owner_user_id
  if (!job || !landlordUserId || !(await hasAiAssistAccess(supabaseAdmin, landlordUserId))) {
    return NextResponse.json({ error: 'AI Assist is not active on this job' }, { status: 403 })
  }
  if (await tooManyAiAssistRequests('polish-bid', user.id, 20)) {
    return NextResponse.json({ error: 'Too many requests right now, try again in a few minutes.' }, { status: 429 })
  }

  const priceLine =
    pricingType === 'hourly' && laborRate
      ? `$${laborRate}/hr${estimatedHours ? `, ~${estimatedHours} hours estimated` : ''}, total bid $${amount}`
      : `$${amount} flat`

  try {
    const result = await claudeJson<{ scope: string }>({
      system:
        'You help a contractor turn rough shorthand notes into a clear, professional bid scope for a property ' +
        'management marketplace, before they submit it to a landlord. Keep their actual meaning and price ' +
        'exactly as given — never invent scope they didn\'t mention, never change the price. Plain language, ' +
        '2-4 sentences, no markdown.',
      prompt:
        `Job category: ${job.category}\nReported issue: ${job.description}\n\n` +
        `Contractor's rough notes: ${notes.trim()}\n` +
        (notIncluded?.trim() ? `What's NOT included: ${notIncluded.trim()}\n` : '') +
        `Price: ${priceLine}\n\n` +
        'Return JSON: { "scope": string } — a clear rewrite of the notes as the bid scope, starting with ' +
        '"Scope:" and keeping it to what they actually said.',
      // Same 2-4 sentence prose scope that truncated at 400 elsewhere
      // (draft-message, lease-qa) — bumped proactively here too.
      maxTokens: 600,
      track: { billedUserId: landlordUserId, callerUserId: user.id, feature: 'bid-polish' },
    })

    return NextResponse.json({ scope: result.scope })
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      console.error('ai-assist/polish-bid: Claude not configured', err)
      return NextResponse.json({ error: 'This isn’t set up yet.' }, { status: 503 })
    }
    console.error('ai-assist/polish-bid: unhandled error', err)
    return NextResponse.json({ error: 'Could not polish that right now. Try again in a moment.' }, { status: 500 })
  }
}
