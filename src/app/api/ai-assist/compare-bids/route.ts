import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { claudeJson } from '@/lib/claude'
import { aiAccessFor } from '@/lib/aiAccess'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { canActForOwner } from '@/lib/pm'

export const maxDuration = 40

type Out = { summary: string; picks: { bidId: string; label: string; reason: string }[]; watchFor: string[]; questions: { bidId: string; question: string }[] }

// POST { jobId } : a plain-language comparison of the sealed bids on a job
// for the landlord or their PM. Contractors are referred to by letter, not
// name, and the AI never sees anything the landlord can't already see.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const { jobId } = (await request.json().catch(() => ({}))) as { jobId?: string }
  const { data: job } = await admin
    .from('jobs')
    .select('id, category, description, is_emergency, units(properties(owner_user_id))')
    .eq('id', jobId || '')
    .maybeSingle()
  const ownerId = (job as any)?.units?.properties?.owner_user_id
  if (!job || !(await canActForOwner(admin, user.id, ownerId))) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const access = await aiAccessFor(admin, { id: ownerId, app_metadata: { role: 'landlord' } })
  if (!access.allowed) return NextResponse.json({ error: 'Prophandld AI is not turned on for this account.', needsAi: true }, { status: 402 })
  if (await tooManyAiAssistRequests('compare-bids', user.id, 20)) return NextResponse.json({ error: 'Too many requests. Try again in a few minutes.' }, { status: 429 })

  const { data: bids } = await admin
    .from('bids')
    .select('id, contractor_user_id, amount, pricing_type, labor_rate, estimated_hours, availability, notes, not_included, status')
    .eq('job_id', job.id)
    .in('status', ['pending', 'accepted'])
  if (!bids || bids.length < 2) return NextResponse.json({ error: 'Comparison needs at least two bids.' }, { status: 400 })

  const contractorIds = Array.from(new Set(bids.map((b) => b.contractor_user_id)))
  const [ratings, { data: creds }, { data: done }] = await Promise.all([
    Promise.all(contractorIds.map(async (id) => [id, (await admin.rpc('get_contractor_rating_summary', { target_contractor_id: id }).maybeSingle()).data as any] as const)),
    admin.from('contractor_credentials').select('contractor_user_id').eq('status', 'verified').in('contractor_user_id', contractorIds),
    admin.from('bids').select('contractor_user_id').in('contractor_user_id', contractorIds).eq('payment_status', 'paid'),
  ])
  const ratingBy = new Map(ratings)
  const verified = new Set((creds || []).map((c: any) => c.contractor_user_id))
  const jobsDone = new Map<string, number>()
  for (const d of done || []) jobsDone.set(d.contractor_user_id, (jobsDone.get(d.contractor_user_id) || 0) + 1)

  const letters = 'ABCDEFGHIJ'
  const lines = bids.slice(0, 10).map((b, i) => {
    const r = ratingBy.get(b.contractor_user_id)
    return [
      `Bid ${letters[i]} (id ${b.id}): $${Number(b.amount).toFixed(2)}${b.pricing_type ? ` (${b.pricing_type})` : ''}`,
      b.labor_rate ? `labor $${b.labor_rate}/hr` : '',
      b.estimated_hours ? `~${b.estimated_hours} hrs` : '',
      b.availability ? `availability: ${String(b.availability).slice(0, 120)}` : '',
      r?.review_count ? `rating ${Number(r.avg_rating).toFixed(1)} from ${r.review_count} reviews` : 'no reviews yet',
      `${jobsDone.get(b.contractor_user_id) || 0} paid jobs on Prophandld`,
      verified.has(b.contractor_user_id) ? 'license/insurance verified' : 'credentials not verified',
      b.notes ? `notes: ${String(b.notes).slice(0, 300)}` : '',
      b.not_included ? `not included: ${String(b.not_included).slice(0, 200)}` : '',
    ].filter(Boolean).join('; ')
  })

  try {
    const out = await claudeJson<Out>({
      system:
        'You help a landlord compare sealed contractor bids. Be neutral and practical. Price matters, but so do what is included, ' +
        'reviews, verified credentials, experience and timing. Never invent facts beyond what is given. Refer to bids by letter. ' +
        'The landlord decides; you only explain trade-offs.',
      prompt:
        `Job: ${job.category}${job.is_emergency ? ' (EMERGENCY, speed matters)' : ''}. Description: ${String(job.description || '').slice(0, 500)}\n\n${lines.join('\n')}\n\n` +
        'Return JSON: {"summary": 2-3 sentences, "picks": [{"bidId": exact id, "label": e.g. "Best overall"|"Lowest price"|"Most experienced"|"Fastest", "reason": one sentence}] (max 3), ' +
        '"watchFor": up to 3 short cautions (e.g. a much lower price that excludes materials), ' +
        '"questions": [{"bidId": exact id, "question": one question worth asking that contractor before choosing}] (max 3)}',
      maxTokens: 900,
      track: { billedUserId: access.billedUserId, callerUserId: user.id, feature: 'compare-bids' },
    })
    const ids = new Set(bids.map((b) => b.id))
    return NextResponse.json({
      summary: typeof out?.summary === 'string' ? out.summary.slice(0, 800) : '',
      picks: (out?.picks || []).filter((p) => ids.has(p.bidId)).slice(0, 3),
      watchFor: (out?.watchFor || []).filter((w) => typeof w === 'string').slice(0, 3),
      questions: (out?.questions || []).filter((q) => ids.has(q.bidId)).slice(0, 3),
    })
  } catch (err) {
    console.error('ai-assist/compare-bids: failed', err)
    return NextResponse.json({ error: 'Could not compare the bids right now. Try again.' }, { status: 500 })
  }
}
