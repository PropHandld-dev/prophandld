import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 20

// The same check job-ready-check runs before a job is first posted, but
// for a job that's already live for bidding — surfaced as a small flag on
// the landlord's jobs list so a job sitting with no bids has an obvious
// first guess why. Computed once and cached on the job row (see
// scripts/2026-11-01-job-ready-cache.sql): every repeat view of the same
// job after the first is a plain row read, no Claude call, so this costs
// nothing extra beyond the one check per job that's already open.
export async function GET(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ ready: true })
  }

  const jobId = request.nextUrl.searchParams.get('jobId')
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('category, description, ai_ready_flag, ai_ready_suggestion, ai_ready_checked_at, units(properties(owner_user_id))')
    .eq('id', jobId)
    .maybeSingle()
  const landlordUserId = (job as any)?.units?.properties?.owner_user_id
  if (!job || landlordUserId !== user.id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (job.ai_ready_checked_at) {
    return NextResponse.json({ ready: !job.ai_ready_flag, suggestion: job.ai_ready_suggestion })
  }

  if (!(await hasAiAssistAccess(supabaseAdmin, user.id))) {
    return NextResponse.json({ ready: true })
  }
  if (await tooManyAiAssistRequests('job-ready-recheck', user.id, 60)) {
    return NextResponse.json({ ready: true })
  }

  const { count: photoCount } = await supabaseAdmin
    .from('job_photos')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .eq('stage', 'general')

  try {
    const result = await claudeJson<{ ready: boolean; suggestion: string | null }>({
      system:
        'You do a quick check on a maintenance job description that is already live for contractors to bid on, ' +
        'for a property management app. Only flag something if it would genuinely leave a contractor unable to ' +
        'bid confidently (too vague to know the scope, missing an obviously relevant detail for that category). ' +
        'Don\'t nitpick fine writing, a short-but-clear description is fine. Be generous — most descriptions ' +
        'should pass.',
      prompt:
        `Category: ${job.category}\nDescription: ${job.description}\nHas a photo attached: ${(photoCount || 0) > 0 ? 'yes' : 'no'}\n\n` +
        'Return JSON: { "ready": boolean, "suggestion": string|null } — suggestion is one short, friendly ' +
        'sentence only when ready is false, null otherwise.',
      maxTokens: 150,
      track: { billedUserId: user.id, callerUserId: user.id, feature: 'job-ready-recheck' },
    })
    await supabaseAdmin
      .from('jobs')
      .update({ ai_ready_flag: !result.ready, ai_ready_suggestion: result.suggestion, ai_ready_checked_at: new Date().toISOString() })
      .eq('id', jobId)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof ClaudeConfigError) return NextResponse.json({ ready: true })
    console.error('ai-assist/job-ready-recheck: unhandled error', err)
    return NextResponse.json({ ready: true })
  }
}
