import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { AI_ASSIST_ENABLED } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { getLandlordIdsAdmin } from '@/lib/landlordIds'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'
import { PHILADELPHIA_COMPLIANCE_FACTS } from '@/lib/complianceFacts'
import { rentMonthBounds } from '@/lib/rentAutomation'

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

LANDLORD can: manage properties (Properties tab) and units, set up a tenant's lease (a unit's Tenancy page), track rent (Rent tab, Reports), post or approve maintenance jobs, review sealed contractor bids and pick one, message anyone via DMs or job chat, track property compliance items (licenses, inspections, insurance) and building systems (HVAC, water heater, etc.), invite contractors (Contractors tab -> Invite button, at /landlord/contractors/invite), see a calendar of due dates, invite another landlord to co-manage your whole portfolio (Profile -> Co-Owners section), add a second role-profile such as a renter account under the same email (Profile -> Linked Profiles section). Subscription is priced by unit count: Free (1 unit), Basic $19.99/mo (2-4 units), Pro $39.99/mo (5-10), Executive $79.99/mo (11-25), Portfolio $79.99 + $1.75/unit above 25 — a 14-day free trial starts the first time a landlord goes past 1 unit.

RENTER can: report a maintenance issue (Report tab), track a reported job's status and chat about it, pay rent by card or bank transfer (Rent tab), upload/view lease and other documents, message their landlord or an assigned contractor, see a calendar of rent due dates and job appointments.

CONTRACTOR can: browse and submit sealed bids on open jobs (nobody, including the contractor, sees competing bids), chat about a job, track earnings and payments (paid directly via Stripe once the landlord approves finished work, no platform cut on the bid amount), set their service area/categories, message landlords.

JOB LIFECYCLE (all three roles watch the same job move through this): reported -> approved by landlord -> open for bidding -> landlord selects a bid -> schedule confirmed -> in progress -> landlord reviews finished work -> paid. A job can also be disputed if something goes wrong.

PROPHANDLD AI (also called AI Assist internally, but always refer to it as "Prophandld AI" when talking to a user): a paid landlord add-on (priced by unit count, 14-day free trial) that unlocks more AI features across the app for that landlord's whole portfolio. Benefits the landlord and their renters, automatically, at no extra cost to the renter — NOT contractors, who don't get Prophandld AI's features regardless of whether the landlord has it on. Features: reading uploaded documents to auto-fill lease/compliance/appliance forms, a lease Q&A chat for renters, a troubleshooting assistant for renters (and landlords doing a job themselves) that can review an attached photo and suggest safe things to try before a contractor is needed, AI-verified compliance renewals, a portfolio digest of what needs attention, drafting routine messages, and a few smaller touches elsewhere. Turned on/managed from Profile. This help assistant itself is separate and always free regardless of Prophandld AI, for every role including contractors.

Legal pages exist at /terms (plus role-specific /terms/landlord, /terms/renter, /terms/contractor) and /privacy — point people there for anything legal/contractual rather than answering a legal question yourself.
`.trim()

type ChatTurn = { role: 'user' | 'assistant'; content: string }

// The signed-in user's OWN real records — never another user's. Itemized,
// not just counts (expanded 2026-11-01: a landlord asked "when does my
// rental license expire" and got "I can see 1 item is expiring but not
// its name or date," which is honest but useless — the count existed,
// the actual item didn't). Still deliberately lean: no tenant/contractor
// names, no message contents, no document contents, capped list lengths,
// since this runs on every single message. This is the one place in
// help-chat allowed to state specific account facts directly instead of
// pointing at a tab — the strict "no other user's data, ever" rule stays
// intact because every query below reuses the exact same ownership-scoped
// ID chains (getLandlordIdsAdmin -> owner_user_id -> property_id ->
// unit_id) every other AI Assist route already enforces, nothing new or
// looser. Compliance facts are real account records, safe to state
// directly; what to actually DO about one still isn't legal advice — the
// system prompt below is explicit about pointing to the real "How do I
// renew this?" AI guide on that item instead of improvising one here.
async function getAccountFacts(admin: ReturnType<typeof getSupabaseAdmin>, authClient: Awaited<ReturnType<typeof createClient>>, userId: string, role: string): Promise<Record<string, unknown>> {
  const todayKey = new Date().toISOString().slice(0, 10)
  const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const ITEM_CAP = 25

  if (role === 'landlord') {
    const landlordIds = await getLandlordIdsAdmin(admin, userId)
    const { data: properties } = await admin.from('properties').select('id, address, city, state').in('owner_user_id', landlordIds).eq('archived', false)
    const propertyIds = (properties || []).map((p) => p.id)
    if (propertyIds.length === 0) return { propertyCount: 0, unitCount: 0 }
    const addressById = new Map((properties || []).map((p) => [p.id, `${p.address}${p.city ? `, ${p.city}` : ''}${p.state ? `, ${p.state}` : ''}`]))

    const [{ count: unitCount }, { data: units }, { data: complianceItems }] = await Promise.all([
      admin.from('units').select('id', { count: 'exact', head: true }).in('property_id', propertyIds),
      admin.from('units').select('id, unit_number, property_id').in('property_id', propertyIds),
      admin
        .from('compliance_items')
        .select('item_type, expiry_date, property_id')
        .in('property_id', propertyIds)
        .order('expiry_date', { ascending: true, nullsFirst: false })
        .limit(ITEM_CAP),
    ])
    const unitIds = (units || []).map((u) => u.id)
    const unitLabelById = new Map((units || []).map((u) => [u.id, `${addressById.get(u.property_id) || 'unknown property'}${u.unit_number ? `, Unit ${u.unit_number}` : ''}`]))

    const [{ data: openJobs }, { data: upcomingRenewals }, { data: rentRows }] = await Promise.all([
      unitIds.length > 0
        ? admin.from('jobs').select('category, status, unit_id').in('unit_id', unitIds).in('status', ['pending_approval', 'approved', 'bidding', 'bid_selected', 'scheduled', 'in_progress', 'pending_review', 'disputed']).limit(ITEM_CAP)
        : Promise.resolve({ data: [] as any[] }),
      unitIds.length > 0
        ? admin.from('tenancies').select('lease_end, rent_amount, unit_id').in('unit_id', unitIds).eq('ended', false).not('lease_end', 'is', null).gte('lease_end', todayKey).lte('lease_end', in30).order('lease_end', { ascending: true }).limit(ITEM_CAP)
        : Promise.resolve({ data: [] as any[] }),
      unitIds.length > 0
        ? admin.from('tenancies').select('id, unit_id, rent_amount, rent_due_day, grace_period_days').in('unit_id', unitIds).eq('ended', false).limit(ITEM_CAP)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const monthlyRentRoll = (rentRows || []).reduce((sum, t) => sum + (Number(t.rent_amount) || 0), 0)

    // Rent amounts alone don't say whether this MONTH's rent actually came
    // in — "who's behind on rent" used to be unanswerable. Same
    // paid/expected comparison and grace-period math cron/rent-reminder
    // already uses to decide who gets a late notice, just read-only here.
    const tenancyIds = (rentRows || []).map((t: any) => t.id)
    const { month: thisMonth, following: nextMonth, firstDate } = rentMonthBounds(0)
    const { data: currentRentPayments } = tenancyIds.length > 0
      ? await admin.from('rent_payments').select('tenancy_id, expected_amount, actual_amount').in('tenancy_id', tenancyIds).gte('month', thisMonth).lt('month', nextMonth)
      : { data: [] as any[] }
    const paymentByTenancy = new Map((currentRentPayments || []).map((p: any) => [p.tenancy_id, p]))
    const rentStatusByUnit = (rentRows || [])
      .map((t: any) => {
        const payment = paymentByTenancy.get(t.id)
        if (!payment) return null
        const expected = Number(payment.expected_amount || 0)
        const paid = Number(payment.actual_amount || 0)
        if (paid >= expected) return null
        const dueDate = new Date(firstDate.getFullYear(), firstDate.getMonth(), t.rent_due_day ?? 1)
        const daysSinceDue = Math.floor((Date.now() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
        const isLate = daysSinceDue >= (t.grace_period_days ?? 5)
        return { unit: unitLabelById.get(t.unit_id) || null, amountDue: Math.round((expected - paid) * 100) / 100, daysSinceDue, isLate }
      })
      .filter((x): x is { unit: string | null; amountDue: number; daysSinceDue: number; isLate: boolean } => x !== null)

    return {
      propertyCount: propertyIds.length,
      properties: (properties || []).map((p) => ({ address: addressById.get(p.id) })),
      unitCount: unitCount || 0,
      monthlyRentRoll,
      // The per-unit breakdown monthlyRentRoll alone can't answer — a
      // landlord asking "what's the rent for each unit" used to only get
      // the portfolio-wide total back, with no way to name individual
      // units, because this is the only place rent_amount was fetched by
      // unit.
      rentByUnit: (rentRows || []).map((t: any) => ({ unit: unitLabelById.get(t.unit_id) || null, rentAmount: t.rent_amount })),
      // Only units NOT fully paid for the current calendar month — an
      // empty array means everyone's current, state that plainly rather
      // than listing every unit as "paid."
      rentStatusThisMonth: rentStatusByUnit,
      // Not filtered to "expiring soon" — a landlord asking about a
      // specific license should get an answer even if it's 90 days out,
      // not just when it's already urgent. Sorted soonest-first, capped.
      // isOverdue computed here rather than left for the model to infer
      // from a bare date — an external audit caught it describing an
      // already-past expiry as merely "due" instead of "overdue."
      complianceItems: (complianceItems || []).map((c) => ({
        itemType: c.item_type,
        expiryDate: c.expiry_date,
        property: addressById.get(c.property_id) || null,
        isOverdue: !!c.expiry_date && c.expiry_date < todayKey,
      })),
      openJobs: (openJobs || []).map((j) => ({ category: j.category, status: j.status, unit: unitLabelById.get(j.unit_id) || null })),
      leaseRenewalsNext30Days: (upcomingRenewals || []).map((t) => ({ unit: unitLabelById.get(t.unit_id) || null, leaseEnd: t.lease_end, rentAmount: t.rent_amount })),
    }
  }

  if (role === 'renter') {
    // get_my_active_tenancy_id() covers the co-renter case via
    // tenancy_occupants (security-definer against auth.uid(), so it runs
    // on the caller's own session, not the admin one) — querying by
    // renter_user_id directly only ever matched the primary tenant, same
    // gap already fixed on renter-status/lease-qa/troubleshoot. A
    // co-renter asking help-chat about their own lease used to get
    // hasActiveLease: false despite a real, active one.
    const { data: tenancyId } = await authClient.rpc('get_my_active_tenancy_id')
    const { data: tenancy } = tenancyId
      ? await admin
          .from('tenancies')
          .select('id, rent_amount, rent_due_day, grace_period_days, lease_end, units(unit_number, properties(address))')
          .eq('id', tenancyId)
          .maybeSingle()
      : { data: null }
    const { data: jobs } = await admin.from('jobs').select('category, status').eq('reported_by', userId).not('status', 'in', '(completed,archived,declined)').limit(ITEM_CAP)

    if (!tenancy) return { hasActiveLease: false, openJobs: (jobs || []).map((j) => ({ category: j.category, status: j.status })) }
    const unit: any = (tenancy as any).units

    // Same paid-vs-expected check as the landlord side — "have I paid
    // rent yet" used to be unanswerable even though the renter's own
    // payment row already has the real answer.
    const { month: thisMonth, following: nextMonth, firstDate } = rentMonthBounds(0)
    const { data: currentPayment } = await admin
      .from('rent_payments')
      .select('expected_amount, actual_amount')
      .eq('tenancy_id', tenancy.id)
      .gte('month', thisMonth)
      .lt('month', nextMonth)
      .maybeSingle()
    let rentStatusThisMonth: { amountDue: number; daysSinceDue: number; isLate: boolean } | 'paid' | null = null
    if (currentPayment) {
      const expected = Number(currentPayment.expected_amount || 0)
      const paid = Number(currentPayment.actual_amount || 0)
      if (paid >= expected) {
        rentStatusThisMonth = 'paid'
      } else {
        const dueDate = new Date(firstDate.getFullYear(), firstDate.getMonth(), tenancy.rent_due_day ?? 1)
        const daysSinceDue = Math.floor((Date.now() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
        rentStatusThisMonth = { amountDue: Math.round((expected - paid) * 100) / 100, daysSinceDue, isLate: daysSinceDue >= (tenancy.grace_period_days ?? 5) }
      }
    }

    return {
      hasActiveLease: true,
      propertyAddress: unit?.properties?.address || null,
      unitNumber: unit?.unit_number || null,
      monthlyRent: tenancy.rent_amount,
      rentDueDay: tenancy.rent_due_day,
      leaseEnd: tenancy.lease_end,
      rentStatusThisMonth,
      openJobs: (jobs || []).map((j) => ({ category: j.category, status: j.status })),
    }
  }

  if (role === 'contractor') {
    const [{ count: pendingBids }, { data: activeJobs }] = await Promise.all([
      admin.from('bids').select('id', { count: 'exact', head: true }).eq('contractor_user_id', userId).eq('status', 'pending'),
      admin.from('bids').select('job_id, amount, jobs(category, status)').eq('contractor_user_id', userId).eq('status', 'accepted').limit(ITEM_CAP),
    ])
    const { data: unpaid } = await admin.from('bids').select('amount').eq('contractor_user_id', userId).eq('status', 'accepted').neq('payment_status', 'paid')
    const unpaidTotal = (unpaid || []).reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
    return {
      pendingBidsCount: pendingBids || 0,
      activeJobs: (activeJobs || []).map((b: any) => ({ category: b.jobs?.category || null, status: b.jobs?.status || null, amount: b.amount })),
      unpaidEarnings: unpaidTotal,
    }
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
    getAccountFacts(supabaseAdmin, authClient, user.id, role),
  ])
  const lang = profile?.preferred_language === 'es' ? 'Spanish' : 'English'

  const conversation = [...trimmedHistory, { role: 'user' as const, content: message.trim() }]
    .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
    .join('\n')

  // A fixed, real, per-role navigation list — not left to the model to
  // guess a path from a feature description, which is exactly how a
  // previous version of this prompt produced a plausible-sounding but
  // wrong link for contractor invites before that page was named here.
  // Only top-level pages with no dynamic ID segment are listed; a
  // property/unit-specific page can't be linked reliably without that
  // unit's real id, so the model is told to name the tab instead for those.
  const NAV_PATHS: Record<string, { path: string; label: string }[]> = {
    landlord: [
      { path: '/landlord', label: 'Dashboard' },
      { path: '/landlord/properties', label: 'Properties' },
      { path: '/landlord/properties/new', label: 'Add a property' },
      { path: '/landlord/jobs', label: 'Jobs' },
      { path: '/landlord/rent', label: 'Rent' },
      { path: '/landlord/reports', label: 'Reports' },
      { path: '/landlord/contractors', label: 'Contractors' },
      { path: '/landlord/contractors/invite', label: 'Invite a contractor' },
      { path: '/landlord/calendar', label: 'Calendar' },
      { path: '/landlord/messages', label: 'Messages' },
      { path: '/profile', label: 'Profile' },
    ],
    renter: [
      { path: '/renter', label: 'Dashboard' },
      { path: '/renter/report', label: 'Report an issue' },
      { path: '/renter/rent', label: 'Rent' },
      { path: '/renter/documents', label: 'Documents' },
      { path: '/renter/calendar', label: 'Calendar' },
      { path: '/renter/messages', label: 'Messages' },
      { path: '/profile', label: 'Profile' },
    ],
    contractor: [
      { path: '/contractor', label: 'Dashboard' },
      { path: '/contractor/settings', label: 'Settings' },
      { path: '/contractor/earnings', label: 'Earnings' },
      { path: '/contractor/calendar', label: 'Calendar' },
      { path: '/contractor/messages', label: 'Messages' },
      { path: '/profile', label: 'Profile' },
    ],
  }
  const navPathList = (NAV_PATHS[role] || []).map((n) => `${n.path} — "${n.label}"`).join('\n')

  try {
    const result = await claudeJson<{ reply: string; suggestEscalate: boolean; navLink: { path: string; label: string } | null }>({
      system:
        `You are Prophandld's in-app help assistant, talking to a signed-in ${role}. Answer using the app ` +
        'knowledge below, and you may also answer questions about THIS person\'s own account using the account ' +
        'facts below (e.g. "how many properties do I have", "when does my rental license expire", "when does my ' +
        'lease end") — those facts are real, itemized, already scoped to this exact signed-in user, safe to ' +
        'state directly and plainly, by name and date, not just "yes something\'s expiring." Never invent a ' +
        'feature, page, or policy not in the app knowledge, and never invent an account fact (an address, a ' +
        'date, an amount) not in the account facts below — if something isn\'t covered by either, say you ' +
        'can\'t see that and point to the right tab instead of guessing. A compliance item\'s type, property, ' +
        'and expiry date from account facts are real records, state them directly — and use its isOverdue flag ' +
        'precisely: a past expiry date is "overdue"/"expired," never softened to merely "due" or "coming up." ' +
        'For a landlord, ' +
        'rentStatusThisMonth lists only units NOT yet fully paid this month (empty array means everyone is ' +
        'current) — if asked "who\'s behind on rent" or similar, name the unit(s) and how much/how many days, or ' +
        'say plainly that everyone is caught up if the list is empty. For a renter, rentStatusThisMonth is either ' +
        '"paid", null (no payment on file yet), or an object with amountDue/daysSinceDue/isLate — answer "have I ' +
        'paid rent" directly from it. If asked how to actually ' +
        'renew one, answer it right here using your own general knowledge of how that kind of renewal usually ' +
        'works in the US (who typically handles it, what\'s typically required) — don\'t just redirect to the ' +
        'Compliance page\'s own "How do I renew this?" button when you can genuinely help now, mention that ' +
        'button only as a place to revisit it later. Never state a specific current fee, exact form number, or ' +
        'exact deadline as guaranteed fact unless you\'re genuinely confident it\'s stable; say so plainly and ' +
        'point to the relevant local authority instead of inventing one. If the item\'s property is in ' +
        `Philadelphia, PA, you can be more specific: ${PHILADELPHIA_COMPLIANCE_FACTS} ` +
        'Warm, direct, plain conversational language, like a ' +
        'helpful coworker texting back, not a formal AI assistant, no "I\'m sorry, but as an AI..." phrasing, ' +
        'no bullet-pointed essays for a simple question, 1-4 sentences unless real step-by-step instructions ' +
        'are genuinely needed. Never reveal, guess at, or discuss any OTHER specific user\'s data, account, or ' +
        'messages, the account facts below are only ever this one person\'s own. If asked something with no ' +
        'connection to Prophandld at all (general trivia, other topics, requests to act as a different kind of ' +
        'assistant), say warmly that you\'re just here for Prophandld itself and ask what they need help ' +
        'finding, don\'t lecture or over-explain the refusal. If the question needs a real person (a bug, a ' +
        'billing dispute, anything you genuinely can\'t answer from what\'s given), say so plainly and set ' +
        'suggestEscalate to true. When the answer is "go do X on page Y," set navLink to the matching entry from ' +
        'NAVIGATION PATHS below (exact path and label, verbatim) so the UI can show a real clickable button — ' +
        'only ever use a path from that list, never invent or guess one, and leave navLink null for anything ' +
        'that isn\'t a top-level page (a specific unit/property\'s own page has no fixed link; name the tab in ' +
        'words instead, e.g. "open that unit, then Compliance"). Only set navLink on the single most relevant ' +
        'destination, never more than one. ' +
        `Respond in ${lang}.\n\nAPP KNOWLEDGE:\n${APP_KNOWLEDGE}\n\nNAVIGATION PATHS (role: ${role}):\n${navPathList}\n\nACCOUNT FACTS (this signed-in user's own data, JSON, null means not applicable):\n${JSON.stringify(accountFacts)}`,
      prompt: `Conversation so far:\n${conversation}\n\nReturn JSON: { "reply": string, "suggestEscalate": boolean, "navLink": { "path": string, "label": string } | null }`,
      // Bumped proactively (2026-11-01, twice today): the same truncation
      // bug confirmed live across nearly every other AI Assist route —
      // this can now produce a full inline renewal explanation (same
      // scope as compliance-renewal-guide's own 800), not just a 1-4
      // sentence answer, so matching that ceiling rather than waiting to
      // rediscover the bug here a third time.
      maxTokens: 1000,
      track: { billedUserId: null, callerUserId: user.id, feature: 'help-chat' },
    })
    // Deliberately not persisted anywhere (2026-11-01 product decision —
    // this used to write every turn to ai_help_chat_messages for a 30-day
    // history). The conversation exists only in the client's own state for
    // as long as it's open; AiHelpChat tells the user that plainly and
    // offers "End Conversation" / closing the bubble as the only ways it
    // ever goes away, both of which already just drop it, nothing to
    // clean up here.
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      return NextResponse.json({ error: 'Not set up yet' }, { status: 503 })
    }
    console.error('ai-assist/help-chat: unhandled error', err)
    return NextResponse.json({ error: 'Could not respond right now. Try again in a moment.' }, { status: 500 })
  }
}
