import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 60

// Compares the before/after photos a contractor attaches to finished work
// and flags if the after photo plausibly doesn't show the described
// problem actually fixed — a quick second look before the landlord
// approves payment, not a verdict. Genuinely not something any mainstream
// repair-marketplace platform does today: this only works because the
// photos and the original description already live on the same job.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ error: 'Only landlords can use AI Assist' }, { status: 403 })
  }

  const { jobId } = (await request.json()) as { jobId?: string }
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('category, description, units(properties(owner_user_id))')
    .eq('id', jobId)
    .maybeSingle()
  const landlordUserId = (job as any)?.units?.properties?.owner_user_id
  if (!job || landlordUserId !== user.id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  if (!(await hasAiAssistAccess(supabaseAdmin, user.id))) {
    return NextResponse.json({ error: 'AI Assist is not active on this account' }, { status: 403 })
  }

  const { data: photos } = await supabaseAdmin
    .from('job_photos')
    .select('photo_url, stage')
    .eq('job_id', jobId)
    .in('stage', ['before', 'after'])
    .order('created_at', { ascending: true })

  const before = (photos || []).find((p) => p.stage === 'before')
  const after = (photos || []).find((p) => p.stage === 'after')
  if (!before || !after) {
    return NextResponse.json({ error: 'Need at least one before and one after photo to compare' }, { status: 400 })
  }

  try {
    const [beforeFile, afterFile] = await Promise.all([
      supabaseAdmin.storage.from('job-photos').download(before.photo_url),
      supabaseAdmin.storage.from('job-photos').download(after.photo_url),
    ])
    if (!beforeFile.data || !afterFile.data) {
      return NextResponse.json({ error: 'Could not load the photos' }, { status: 500 })
    }
    const [beforeBase64, afterBase64] = await Promise.all([
      beforeFile.data.arrayBuffer().then((b) => Buffer.from(b).toString('base64')),
      afterFile.data.arrayBuffer().then((b) => Buffer.from(b).toString('base64')),
    ])

    const result = await claudeJson<{ looksResolved: boolean; note: string }>({
      system:
        'You compare a "before" and "after" photo of a maintenance repair for a property management app, to give ' +
        'a landlord a quick second look before they approve payment, NOT a final verdict — always be clear this ' +
        'is just a visual sanity check, the landlord makes the real call. Look at whether the after photo ' +
        'plausibly shows the described problem addressed. A different angle or lighting is not itself a red ' +
        'flag. Only say looksResolved: false if something genuinely looks off (the same problem still visible, ' +
        'the after photo doesn\'t appear related to the described issue at all, etc).',
      prompt:
        `Job category: ${job.category}\nReported issue: ${job.description}\n\n` +
        'The first image is BEFORE, the second is AFTER. Return JSON: { "looksResolved": boolean, "note": string ' +
        '} — note is one short, plain sentence either way.',
      files: [
        { base64: beforeBase64, mediaType: 'image/jpeg' },
        { base64: afterBase64, mediaType: 'image/jpeg' },
      ],
      maxTokens: 250,
      track: { billedUserId: user.id, callerUserId: user.id, feature: 'before-after-check' },
    })

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      return NextResponse.json({ error: 'This isn’t set up yet.' }, { status: 503 })
    }
    console.error('ai-assist/before-after-check: unhandled error', err)
    return NextResponse.json({ error: 'Could not compare those photos right now.' }, { status: 500 })
  }
}
