import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logPmAction } from '@/lib/pm'
import { resolvePair } from '@/lib/pmThread'
import { notifyUser } from '@/lib/notifyUser'
import { tooManyRequests } from '@/lib/rateLimit'

export const maxDuration = 20

// GET ?owner= : the conversation, plus (for the PM) jobs waiting on the
// owner's sign-off that an approval card can be sent for.
export async function GET(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const pair = await resolvePair(admin, user.id, request.nextUrl.searchParams.get('owner'))
  if (!pair) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  const [{ data: messages }, { data: owner }, { data: reads }] = await Promise.all([
    admin
      .from('pm_owner_messages')
      .select('id, sender_user_id, sender_side, kind, body, action, action_status, decided_at, created_at')
      .eq('organization_id', pair.organizationId)
      .eq('owner_user_id', pair.ownerUserId)
      .order('created_at', { ascending: true })
      .limit(300),
    admin.from('users').select('full_name').eq('id', pair.ownerUserId).maybeSingle(),
    admin
      .from('pm_owner_thread_reads')
      .select('reader_user_id, last_read_at')
      .eq('organization_id', pair.organizationId)
      .eq('owner_user_id', pair.ownerUserId),
  ])
  const senderIds = Array.from(new Set((messages || []).map((m: any) => m.sender_user_id).filter(Boolean)))
  const { data: senders } = senderIds.length ? await admin.from('users').select('id, full_name').in('id', senderIds) : { data: [] }
  const senderName = new Map((senders || []).map((s: any) => [s.id, s.full_name]))

  // The other side's latest read time, for "Seen".
  const otherRead = (reads || [])
    .filter((r: any) => (pair.side === 'owner' ? r.reader_user_id !== pair.ownerUserId : r.reader_user_id === pair.ownerUserId))
    .map((r: any) => r.last_read_at)
    .sort()
    .pop() || null

  // Accepted, unpaid jobs on this client's properties: what an approval
  // card can be sent for.
  let payableJobs: { bidId: string; jobId: string; title: string; amount: number; overLimit: boolean; requested: boolean }[] = []
  if (pair.side === 'pm') {
    const [{ data: props }, { data: portfolioRow }] = await Promise.all([
      admin.from('properties').select('id, address').eq('owner_user_id', pair.ownerUserId),
      admin.from('pm_client_portfolios').select('approval_threshold').eq('organization_id', pair.organizationId).eq('owner_user_id', pair.ownerUserId).maybeSingle(),
    ])
    const propIds = (props || []).map((p: any) => p.id)
    const addr = new Map((props || []).map((p: any) => [p.id, p.address]))
    const { data: units } = propIds.length ? await admin.from('units').select('id, property_id').in('property_id', propIds) : { data: [] }
    const unitProp = new Map((units || []).map((u: any) => [u.id, u.property_id]))
    const { data: jobs } = units?.length ? await admin.from('jobs').select('id, category, unit_id').in('unit_id', units.map((u: any) => u.id)) : { data: [] }
    const jobById = new Map((jobs || []).map((j: any) => [j.id, j]))
    const { data: bids } = jobs?.length
      ? await admin.from('bids').select('id, job_id, amount, payment_status').in('job_id', jobs.map((j: any) => j.id)).eq('status', 'accepted').or('payment_status.is.null,payment_status.in.(pending,failed,unpaid)')
      : { data: [] }
    const requestedBids = new Set((messages || []).filter((m: any) => m.kind === 'approval' && m.action_status !== 'declined').map((m: any) => m.action?.bidId).filter(Boolean))
    const threshold = Number(portfolioRow?.approval_threshold || 0)
    payableJobs = (bids || []).map((b: any) => {
      const j: any = jobById.get(b.job_id)
      return {
        bidId: b.id,
        jobId: b.job_id,
        title: `${j?.category || 'Job'} · ${addr.get(unitProp.get(j?.unit_id)) || ''}`,
        amount: Number(b.amount),
        overLimit: Number(b.amount) > threshold,
        requested: requestedBids.has(b.id),
      }
    })
  }

  // What an approval card needs so the owner can decide from the card
  // itself: the problem, whether this is a quote or finished work, who the
  // contractor is (and how they're rated), photos, and why it needs their
  // sign-off (over their limit). Looked up fresh on every read, so it
  // always reflects the job as it is now.
  const approvalJobIds = Array.from(new Set((messages || []).filter((m: any) => m.kind === 'approval' && m.action?.jobId).map((m: any) => String(m.action.jobId))))
  const jobDetail = new Map<string, Record<string, unknown>>()
  let ownerLimit: number | null = null
  if (approvalJobIds.length) {
    const [{ data: aJobs }, { data: aBids }, { data: aPhotos }, { data: portfolio }] = await Promise.all([
      admin.from('jobs').select('id, category, description, status').in('id', approvalJobIds),
      admin.from('bids').select('job_id, contractor_user_id, payment_status').in('job_id', approvalJobIds).eq('status', 'accepted'),
      admin.from('job_photos').select('job_id, photo_url, stage').in('job_id', approvalJobIds).order('created_at', { ascending: true }).limit(60),
      admin.from('pm_client_portfolios').select('approval_threshold').eq('organization_id', pair.organizationId).eq('owner_user_id', pair.ownerUserId).maybeSingle(),
    ])
    ownerLimit = portfolio ? Number(portfolio.approval_threshold || 0) : null
    const contractorIds = Array.from(new Set((aBids || []).map((b: any) => b.contractor_user_id).filter(Boolean)))
    const [{ data: cUsers }, ratings] = await Promise.all([
      contractorIds.length ? admin.from('users').select('id, full_name').in('id', contractorIds) : Promise.resolve({ data: [] as any[] }),
      Promise.all(contractorIds.map(async (id) => [id, (await admin.rpc('get_contractor_rating_summary', { target_contractor_id: id }).maybeSingle()).data as { avg_rating: number; review_count: number } | null] as const)),
    ])
    const cName = new Map((cUsers || []).map((u: any) => [u.id, u.full_name?.trim()]))
    const ratingById = new Map(ratings)
    const imgs = (aPhotos || []).filter((p: any) => !/\.(mp4|mov|webm|m4v|avi)$/i.test(p.photo_url))
    const signed = new Map<string, string>()
    if (imgs.length) {
      const { data } = await admin.storage.from('job-photos').createSignedUrls(imgs.map((p: any) => p.photo_url), 3600)
      for (const x of data || []) if (x.path && x.signedUrl) signed.set(x.path, x.signedUrl)
    }
    for (const j of aJobs || []) {
      const bid: any = (aBids || []).find((b: any) => b.job_id === j.id)
      const rating = bid ? ratingById.get(bid.contractor_user_id) : null
      jobDetail.set(j.id, {
        category: j.category,
        description: j.description ? String(j.description).slice(0, 400) : null,
        stage: ['completed', 'archived', 'pending_review'].includes(j.status) ? 'finished' : 'quote',
        paid: bid?.payment_status === 'paid',
        contractor: bid ? cName.get(bid.contractor_user_id) || null : null,
        rating: rating && rating.review_count ? { avg: Math.round(Number(rating.avg_rating) * 10) / 10, count: rating.review_count } : null,
        photos: imgs.filter((p: any) => p.job_id === j.id).map((p: any) => ({ url: signed.get(p.photo_url), stage: p.stage })).filter((p: any) => p.url).slice(-4),
      })
    }
  }

  await admin
    .from('pm_owner_thread_reads')
    .upsert({ organization_id: pair.organizationId, owner_user_id: pair.ownerUserId, reader_user_id: user.id, last_read_at: new Date().toISOString() })

  return NextResponse.json({
    side: pair.side,
    me: user.id,
    orgName: pair.orgName,
    logoUrl: pair.logoUrl,
    ownerName: owner?.full_name || 'Owner',
    otherLastReadAt: otherRead,
    payableJobs,
    messages: (messages || []).map((m: any) => ({
      id: m.id,
      mine: m.sender_user_id === user.id,
      senderSide: m.sender_side,
      senderName: senderName.get(m.sender_user_id) || (m.sender_side === 'pm' ? pair.orgName : 'Owner'),
      kind: m.kind,
      body: m.body,
      action: m.action,
      job: m.kind === 'approval' && m.action?.jobId ? jobDetail.get(String(m.action.jobId)) || null : null,
      ownerLimit: m.kind === 'approval' ? ownerLimit : null,
      actionStatus: m.action_status,
      decidedAt: m.decided_at,
      createdAt: m.created_at,
    })),
  })
}

// POST { owner?, body } or { owner, approval: { type, bidId?, title, amount? } }
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const b = (await request.json().catch(() => ({}))) as Record<string, any>
  const pair = await resolvePair(admin, user.id, typeof b.owner === 'string' ? b.owner : null)
  if (!pair) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  if (await tooManyRequests(`pm-thread:${user.id}`, 60, 10)) {
    return NextResponse.json({ error: 'Too many messages. Wait a moment.' }, { status: 429 })
  }

  const body = typeof b.body === 'string' ? b.body.trim().slice(0, 4000) : ''
  let row: Record<string, unknown>

  if (b.approval) {
    if (pair.side !== 'pm') return NextResponse.json({ error: 'Only the property manager sends approval requests' }, { status: 403 })
    const a = b.approval
    const title = typeof a.title === 'string' ? a.title.trim().slice(0, 140) : ''
    const amount = a.amount === null || a.amount === undefined || a.amount === '' ? null : Number(a.amount)
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000)) return NextResponse.json({ error: 'Enter a valid amount' }, { status: 400 })
    let action: Record<string, unknown>
    if (a.type === 'job_payment') {
      const { data: bid } = await admin
        .from('bids')
        .select('id, amount, job_id, payment_status, jobs(category, units(properties(owner_user_id, address)))')
        .eq('id', String(a.bidId || ''))
        .maybeSingle()
      const prop = (bid as any)?.jobs?.units?.properties
      if (!bid || prop?.owner_user_id !== pair.ownerUserId) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      if (bid.payment_status === 'paid') return NextResponse.json({ error: 'That job is already paid' }, { status: 409 })
      action = { type: 'job_payment', bidId: bid.id, jobId: bid.job_id, amount: Number(bid.amount), title: title || `Pay ${(bid as any).jobs?.category || 'job'} at ${prop.address}` }
    } else {
      if (!title) return NextResponse.json({ error: 'Say what you need approved' }, { status: 400 })
      action = { type: 'general', title, amount }
    }
    row = {
      organization_id: pair.organizationId,
      owner_user_id: pair.ownerUserId,
      sender_user_id: user.id,
      sender_side: 'pm',
      kind: 'approval',
      body: body || String(action.title),
      action,
      action_status: 'pending',
    }
  } else {
    if (!body) return NextResponse.json({ error: 'Write a message' }, { status: 400 })
    row = { organization_id: pair.organizationId, owner_user_id: pair.ownerUserId, sender_user_id: user.id, sender_side: pair.side, kind: 'text', body }
  }

  const { data: saved, error } = await admin.from('pm_owner_messages').insert(row).select('id').single()
  if (error || !saved) {
    console.error('pm/thread: insert failed', error)
    return NextResponse.json({ error: 'Could not send. Try again.' }, { status: 500 })
  }

  const { data: me } = await admin.from('users').select('full_name').eq('id', user.id).maybeSingle()
  const isApproval = row.kind === 'approval'
  const action = row.action as any
  if (pair.side === 'pm') {
    await notifyUser(admin, pair.ownerUserId, {
      title: isApproval ? `${pair.orgName} needs your approval` : `${pair.orgName}`,
      body: isApproval ? `${action.title}${action.amount ? ` · $${Number(action.amount).toFixed(2)}` : ''}` : String(row.body).slice(0, 140),
      url: '/landlord/pm?thread=1',
      critical: isApproval,
      sms: isApproval ? `${pair.orgName} needs your approval: ${action.title}${action.amount ? ` ($${Number(action.amount).toFixed(2)})` : ''}.` : undefined,
      email: isApproval
        ? {
            subject: `Approval needed: ${action.title}`,
            eyebrow: 'Approval needed',
            heading: action.title,
            body: `${me?.full_name || pair.orgName} asked for your approval. Open the conversation to approve or decline in one tap.${row.body !== action.title ? `\n\n"${row.body}"` : ''}`,
            ctaLabel: 'Review',
            facts: action.amount ? [{ label: 'Amount', value: `$${Number(action.amount).toFixed(2)}` }] : [],
          }
        : undefined,
    })
    if (isApproval) {
      await logPmAction(admin, { organizationId: pair.organizationId, ownerUserId: pair.ownerUserId, actorUserId: user.id, action: 'owner_approval_requested', amount: action.amount || undefined, detail: action.title }).catch(() => {})
    }
  } else {
    // Owner wrote: tell the PM company's admin (and the assigned staff see
    // it when they open the conversation).
    await notifyUser(admin, pair.orgAdminId, {
      title: me?.full_name || 'Your client',
      body: String(row.body).slice(0, 140),
      url: `/landlord/pm?thread=${pair.ownerUserId}`,
    })
  }
  return NextResponse.json({ ok: true, id: saved.id })
}
