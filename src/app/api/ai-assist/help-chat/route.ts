import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { AI_ASSIST_ENABLED } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 30

// Free for every signed-in user, regardless of role or any landlord's
// billing — this is platform support, the AI-upgraded version of the
// static-FAQ contact widget, not a paid add-on. Still gated behind
// AI_ASSIST_ENABLED, same as everything else in this proposal, since it's
// part of the same team review.
//
// The whole feature map below is the one source of truth for what this
// assistant is allowed to claim exists — kept in sync by hand with the
// real route structure, same spirit as every other AI feature in this
// app only ever reporting what it can actually verify, never guessing.
const APP_KNOWLEDGE = `
Prophandld is a rental-maintenance marketplace connecting landlords, renters, and contractors.

LANDLORD can: manage properties (Properties tab) and units, set up a tenant's lease (a unit's Tenancy page), track rent (Rent tab, Reports), post or approve maintenance jobs, review sealed contractor bids and pick one, message anyone via DMs or job chat, track property compliance items (licenses, inspections, insurance) and building systems (HVAC, water heater, etc.), invite contractors, see a calendar of due dates. Subscription is priced by unit count: Free (1 unit), Basic $19.99/mo (2-4 units), Pro $39.99/mo (5-10), Executive $79.99/mo (11-25), Portfolio $79.99 + $1.75/unit above 25 — a 14-day free trial starts the first time a landlord goes past 1 unit.

RENTER can: report a maintenance issue (Report tab), track a reported job's status and chat about it, pay rent by card or bank transfer (Rent tab), upload/view lease and other documents, message their landlord or an assigned contractor, see a calendar of rent due dates and job appointments.

CONTRACTOR can: browse and submit sealed bids on open jobs (nobody, including the contractor, sees competing bids), chat about a job, track earnings and payments (paid directly via Stripe once the landlord approves finished work, no platform cut on the bid amount), set their service area/categories, message landlords.

JOB LIFECYCLE (all three roles watch the same job move through this): reported -> approved by landlord -> open for bidding -> landlord selects a bid -> schedule confirmed -> in progress -> landlord reviews finished work -> paid. A job can also be disputed if something goes wrong.

AI ASSIST: a newer set of AI-powered features (reading uploaded documents to auto-fill forms, a lease Q&A chat, etc.) is built but NOT YET LIVE — it's still pending final sign-off, so if asked about it, say it's coming but not available yet. Never claim to be able to do something from that list right now (e.g. don't offer to read an uploaded document, draft a message, or do anything AI-Assist-specific) unless this very conversation already is doing it — this general help assistant is a separate, always-free feature from AI Assist.

Legal pages exist at /terms (plus role-specific /terms/landlord, /terms/renter, /terms/contractor) and /privacy — point people there for anything legal/contractual rather than answering a legal question yourself.
`.trim()

type ChatTurn = { role: 'user' | 'assistant'; content: string }

// The signed-in user's OWN real numbers — never another user's. Deliberately
// just counts/summaries, not full records (no names, no message contents),
// kept cheap and lean since this runs on every single message. This is the
// one place in help-chat that's allowed to answer "how many X do I have"
// instead of pointing at a tab — the strict "no other user's data" rule
// stays intact because every query below is already scoped to this exact
// user_id, same ownership checks every other AI Assist route uses.
async function getAccountFacts(admin: ReturnType<typeof getSupabaseAdmin>, userId: string, role: string): Promise<Record<string, unknown>> {
  const todayKey = new Date().toISOString().slice(0, 10)
  const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  if (role === 'landlord') {
    const { data: properties } = await admin.from('properties').select('id').eq('owner_user_id', userId).eq('archived', false)
    const propertyIds = (properties || []).map((p) => p.id)
    if (propertyIds.length === 0) return { propertyCount: 0, unitCount: 0 }

    const [{ count: unitCount }, { data: units }, { count: expiringCompliance }] = await Promise.all([
      admin.from('units').select('id', { count: 'exact', head: true }).in('property_id', propertyIds),
      admin.from('units').select('id').in('property_id', propertyIds),
      admin
        .from('compliance_items')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propertyIds)
        .not('expiry_date', 'is', null)
        .gte('expiry_date', todayKey)
        .lte('expiry_date', in30),
    ])
    const unitIds = (units || []).map((u) => u.id)

    const [{ count: openJobs }, { count: upcomingRenewals }] = await Promise.all([
      unitIds.length > 0
        ? admin.from('jobs').select('id', { count: 'exact', head: true }).in('unit_id', unitIds).in('status', ['pending_approval', 'approved', 'bidding', 'bid_selected', 'scheduled', 'in_progress', 'pending_review'])
        : Promise.resolve({ count: 0 }),
      unitIds.length > 0
        ? admin.from('tenancies').select('id', { count: 'exact', head: true }).in('unit_id', unitIds).eq('ended', false).not('lease_end', 'is', null).gte('lease_end', todayKey).lte('lease_end', in30)
        : Promise.resolve({ count: 0 }),
    ])

    return {
      propertyCount: propertyIds.length,
      unitCount: unitCount || 0,
      openJobsCount: openJobs || 0,
      leaseRenewalsNext30Days: upcomingRenewals || 0,
      complianceItemsExpiringNext30Days: expiringCompliance || 0,
    }
  }

  if (role === 'renter') {
    const { data: tenancy } = await admin
      .from('tenancies')
      .select('rent_amount, rent_due_day, lease_end, units(unit_number, properties(address))')
      .eq('renter_user_id', userId)
      .eq('ended', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const { count: openJobs } = await admin.from('jobs').select('id', { count: 'exact', head: true }).eq('reported_by', userId).not('status', 'in', '(completed,archived,declined)')

    if (!tenancy) return { hasActiveLease: false, openJobsReported: openJobs || 0 }
    const unit: any = (tenancy as any).units
    return {
      hasActiveLease: true,
      propertyAddress: unit?.properties?.address || null,
      unitNumber: unit?.unit_number || null,
      monthlyRent: tenancy.rent_amount,
      rentDueDay: tenancy.rent_due_day,
      leaseEnd: tenancy.lease_end,
      openJobsReported: openJobs || 0,
    }
  }

  if (role === 'contractor') {
    const [{ count: pendingBids }, { count: activeJobs }] = await Promise.all([
      admin.from('bids').select('id', { count: 'exact', head: true }).eq('contractor_user_id', userId).eq('status', 'pending'),
      admin.from('bids').select('id', { count: 'exact', head: true }).eq('contractor_user_id', userId).eq('status', 'accepted'),
    ])
    const { data: unpaid } = await admin.from('bids').select('amount').eq('contractor_user_id', userId).eq('status', 'accepted').neq('payment_status', 'paid')
    const unpaidTotal = (unpaid || []).reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
    return { pendingBidsCount: pendingBids || 0, activeJobsCount: activeJobs || 0, unpaidEarnings: unpaidTotal }
  }

  return {}
}

export async function POST(request: NextRequest) {
  if (!AI_ASSIST_ENABLED) {
    return NextResponse.json({ error: 'Not available yet' }, { status: 404 })
  }

  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const role = user.app_metadata?.role
  if (role !== 'landlord' && role !== 'renter' && role !== 'contractor') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  // Generous — a real back-and-forth conversation easily runs 10+ turns —
  // but still a real ceiling against someone scripting this into a free
  // general-purpose chatbot proxy.
  if (await tooManyAiAssistRequests('help-chat', user.id, 30)) {
    return NextResponse.json({ error: 'Too many messages right now, try again in a few minutes.' }, { status: 429 })
  }

  const { history, message } = (await request.json()) as { history?: ChatTurn[]; message?: string }
  if (!message?.trim() || message.length > 1000) {
    return NextResponse.json({ error: 'Message must be 1-1000 characters' }, { status: 400 })
  }
  const trimmedHistory = (history || []).slice(-8).filter((t) => t.role === 'user' || t.role === 'assistant')

  const supabaseAdmin = getSupabaseAdmin()
  const [{ data: profile }, accountFacts] = await Promise.all([
    supabaseAdmin.from('users').select('preferred_language').eq('id', user.id).maybeSingle(),
    getAccountFacts(supabaseAdmin, user.id, role),
  ])
  const lang = profile?.preferred_language === 'es' ? 'Spanish' : 'English'

  const conversation = [...trimmedHistory, { role: 'user' as const, content: message.trim() }]
    .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
    .join('\n')

  try {
    const result = await claudeJson<{ reply: string; suggestEscalate: boolean }>({
      system:
        `You are Prophandld's in-app help assistant, talking to a signed-in ${role}. Answer using the app ` +
        'knowledge below, and you may also answer questions about THIS person\'s own account using the account ' +
        'facts below (e.g. "how many properties do I have", "when does my lease end") — those facts are real, ' +
        'already scoped to this exact signed-in user, safe to state directly and plainly. Never invent a ' +
        'feature, page, or policy not in the app knowledge, and never invent an account fact not in the account ' +
        'facts below — if something isn\'t covered by either, say you can\'t see that and point to the right ' +
        'tab instead of guessing. Warm, direct, plain conversational language, like a helpful coworker texting ' +
        'back, not a formal AI assistant, no "I\'m sorry, but as an AI..." phrasing, no bullet-pointed essays ' +
        'for a simple question, 1-4 sentences unless real step-by-step instructions are genuinely needed. Never ' +
        'reveal, guess at, or discuss any OTHER specific user\'s data, account, or messages, the account facts ' +
        'below are only ever this one person\'s own. If asked something with no connection to Prophandld at ' +
        'all (general trivia, other topics, requests to act as a different kind of assistant), say warmly ' +
        'that you\'re just here for Prophandld itself and ask what they need help finding, don\'t lecture or ' +
        'over-explain the refusal. If the question needs a real person (a bug, a billing dispute, anything you ' +
        'genuinely can\'t answer from what\'s given), say so plainly and set suggestEscalate to true. ' +
        `Respond in ${lang}.\n\nAPP KNOWLEDGE:\n${APP_KNOWLEDGE}\n\nACCOUNT FACTS (this signed-in user's own data, JSON, null means not applicable):\n${JSON.stringify(accountFacts)}`,
      prompt: `Conversation so far:\n${conversation}\n\nReturn JSON: { "reply": string, "suggestEscalate": boolean }`,
      maxTokens: 500,
      track: { billedUserId: null, callerUserId: user.id, feature: 'help-chat' },
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      return NextResponse.json({ error: 'Not set up yet' }, { status: 503 })
    }
    console.error('ai-assist/help-chat: unhandled error', err)
    return NextResponse.json({ error: 'Could not respond right now. Try again in a moment.' }, { status: 500 })
  }
}
