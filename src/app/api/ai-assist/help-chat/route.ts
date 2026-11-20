import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { AI_ASSIST_ENABLED } from '@/lib/aiAssist'
import { aiAccessFor } from '@/lib/aiAccess'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { getLandlordIdsAdmin } from '@/lib/landlordIds'
import { getPmMembership, scopeOwnerIdsForMember } from '@/lib/pm'
import { claudeText, claudeStream, ClaudeConfigError, CLAUDE_SMART_MODEL } from '@/lib/claude'
import { PHILADELPHIA_COMPLIANCE_FACTS } from '@/lib/complianceFacts'
import { rentMonthBounds } from '@/lib/rentAutomation'
import { nextEscalationDate } from '@/lib/leaseEscalation'

export const maxDuration = 45

// Part of Prophandld AI (the landlord-paid add-on), same gating as every
// other feature in it — reversed from an earlier "always free for
// everyone" design (2026-11-04) once that turned out not to be the
// intended product shape. A landlord needs their own active Prophandld AI
// to use this; a renter rides on their landlord's, same as lease Q&A;
// contractors don't get it at all, same as every other Prophandld AI
// feature.
//
// The whole feature map below is the one source of truth for what this
// assistant is allowed to claim exists — kept in sync by hand with the
// real route structure, same spirit as every other AI feature in this
// app only ever reporting what it can actually verify, never guessing.
const APP_KNOWLEDGE = `
Prophandld is a rental-property platform for landlords, property managers (PMs), renters, and contractors: maintenance jobs, rent, leases, compliance, records, and messaging in one place.

LANDLORD can: manage properties (Properties tab; Add a property) and units; set up a tenant's lease on a unit's Tenancy page, including rent escalation, occupants, pets; build a Pennsylvania lease with AI from a unit's Lease page; screen a prospective tenant from the unit page; invite a tenant by email; track rent (Rent tab, one-tap "Mark received"); bill utilities (water, electric, gas, trash, sewer, internet) to a tenant from a unit's Rent page, and the tenant is notified; post or approve maintenance jobs and review sealed contractor bids (AI can compare bids); track compliance items (rental license, inspections, lead certificate, insurance) on the Compliance page with expiry status; keep documents per property on the Documents page; keep an income and expense ledger on the Records page (scan a receipt, "Explain my year" AI summary, CSV export for taxes); track building systems and appliances per unit; see a Calendar; message anyone (Messages); invite contractors; add a co-owner (Profile -> Co-Owners); choose light or dark appearance (Profile); set how tenants may pay rent (Profile -> payment options: bank transfer, debit card, Venmo, Zelle, Cash App, check, cash, each can be switched on or off); connect a payout account on the Payouts page to receive online rent.

LANDLORD WITH A PROPERTY MANAGER (owner side): the Property Management page shows who manages them ("Managed by"). The OWNER sets the PM's approval limit (jobs at or under it the PM can approve alone; above it the owner must approve), approves or declines the PM's management fee, can make their portfolio read-only for themselves, can approve or decline a PM's request to have rent paid to the PM, messages the PM in a dedicated owner thread with approval cards, and can end the relationship any time with "Remove manager" (it asks about pending jobs, rent routing, and handover before ending). Owners still own everything; the PM acts on their behalf.

PROPERTY MANAGER can (Property Management page, /landlord/pm): see every client in one dashboard ("Needs you", "All clients" switcher, rent collected, maintenance paid, open jobs, compliance expiring across every client); invite a client by entering the email of an existing landlord account (the owner accepts); add and manage properties, units, tenants, jobs, and rent for clients exactly like an owner would; approve jobs up to each client's approval limit (bulk-approve from Pending approvals); set a management fee per client (flat or percent of rent, monthly etc.) which the owner must approve before anything is charged; request that a client's rent be paid to the PM's own payout account (needs the PM's broker license and trust-account attestation plus the owner's approval); send monthly owner statements (Statement per client); message owners in a thread with approval cards and AI-drafted updates; build a contractor network shared across clients; add teammates (admin or staff) and limit a staff member to specific clients or hide financials; choose real-time or daily digest notifications; publish a public profile ("Get found on Prophandld": logo, colors, style, service area, specialties, license, insurance, team) so owners can find and request them; see an audit log of actions; export the portfolio. Payouts page: set up payouts to collect management fees.

RENTER can: report a maintenance issue (Report tab, AI helps describe it and flags emergencies), track a job and chat about it, pay rent (Rent tab) by bank transfer (free, 1-3 business days) or debit card (instant, card fee paid by the renter) when the landlord accepts them, or see the landlord's Venmo/Zelle/Cash App/check/cash details; credit cards are never accepted for rent and get refunded if tried; see utility bills; view lease and documents; ask questions about their lease (lease Q&A); message their landlord or property manager; see a calendar. If a PM manages the property, the renter usually deals with the PM.

CONTRACTOR can: browse and submit sealed bids on open jobs (nobody sees competing bids; AI can polish a bid), chat about a job, follow a step-by-step job guide, track earnings and payments (paid via Stripe once the landlord approves finished work and pays; no platform cut on the bid), set service area and categories, upload license and insurance for verification, message landlords and PMs.

JOB LIFECYCLE: reported -> approved by landlord or PM (or the owner, above the PM's limit) -> open for bidding -> a bid is selected -> schedule confirmed -> in progress -> finished work reviewed (auto-approves after 3 days) -> payment due -> paid. A job can be disputed.

PRICING: Prophandld is in a free pilot: free for 6 months for landlords and property managers, Prophandld AI included, no card needed. Pricing is coming soon and will be set with user feedback; never quote dollar amounts for Prophandld plans. Prophandld takes no fee on rent; bank-transfer rent costs the landlord nothing (Prophandld covers the processing fee); the only fees are payment processors' own card fees.

PROPHANDLD AI: on for every landlord and PM during the pilot and reaches their renters too. Features: this assistant, document reading to fill lease/compliance/appliance forms, receipt and utility-bill scanning, lease Q&A for renters, repair troubleshooting with photos, issue intake with emergency detection, bid comparison, compliance gap checks and renewal guides, portfolio digest, Explain my year, AI lease builder, message drafting and translation (English/Spanish), smart replies.

Legal pages: /terms (plus /terms/landlord, /terms/renter, /terms/contractor, /terms/property-manager) and /privacy.
`.trim()

// Reference facts for the questions people actually ask, checked against
// the statutes rather than left to the model's memory. General information,
// not legal advice.
const RENTAL_LAW_FACTS = `
Pennsylvania (Landlord and Tenant Act of 1951): security deposit max 2 months' rent in the first year of a lease, max 1 month's rent from the start of the second year; after 5 years of tenancy the deposit can't be raised even if rent goes up. Deposits over $100 held more than 2 years must go in an escrow account and the tenant gets interest (minus a 1% fee) from the third year. On move-out the landlord has 30 days to return the deposit with an itemized list of any deductions (the tenant must give a forwarding address in writing); missing that deadline forfeits the right to withhold and can mean double damages. Nonpayment notice to quit: 10 days; for other breaches, 15 days (lease of 1 year or less) or 30 days (longer), unless the lease waives notice. PA has no statewide cap on rent increases or late fees, but late fees must be in the lease and reasonable.
Philadelphia: rental license and a Certificate of Rental Suitability are required to collect rent and to evict; tenants get the "Partners for Good Housing" handbook and the City's lead-safe certification where required (pre-1978 buildings). Heat: from October 1 to April 30 landlords who supply heat must keep units at least 68°F from 6:30am to 10:30pm and 64°F overnight; no heat in winter is an emergency, so act the same day: get a heating contractor out immediately, give space heaters or temporary housing if it can't be fixed fast, and keep the tenant updated in writing. Philadelphia's Eviction Diversion Program must be tried before filing an eviction for nonpayment. Good Cause protections apply to leases of 1 year or less. Fair housing: never screen or treat tenants differently by race, color, religion, national origin, sex, disability, familial status, or Philadelphia's added classes (including source of income such as housing vouchers, sexual orientation, gender identity, age, marital status, domestic-violence-survivor status).
`.trim()

type ChatTurn = { role: 'user' | 'assistant'; content: string }

// One portfolio's facts (a landlord's own, or one PM client's), scoped by
// the owner ids passed in.
async function portfolioFacts(admin: ReturnType<typeof getSupabaseAdmin>, landlordIds: string[], ITEM_CAP: number, todayKey: string, in30: string): Promise<Record<string, unknown>> {
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
    const own = await portfolioFacts(admin, await getLandlordIdsAdmin(admin, userId), ITEM_CAP, todayKey, in30)
    const membership = await getPmMembership(admin, userId)
    if (membership) {
      // A PM: every client they can see, each with the same facts an owner
      // gets, plus the terms of that client relationship.
      const { data: portfolios } = await admin
        .from('pm_client_portfolios')
        .select('owner_user_id, invited_email, approval_threshold, management_fee, management_fee_frequency, management_fee_type, management_fee_percent, fee_owner_approved_at, rent_recipient, rent_to_pm_requested_at, rent_to_pm_approved_at, owner_read_only, status, users!pm_client_portfolios_owner_user_id_fkey(full_name, email)')
        .eq('organization_id', membership.organizationId)
        .in('status', ['accepted', 'pending'])
      const accepted = (portfolios || []).filter((p: any) => p.status === 'accepted')
      const visible = new Set(await scopeOwnerIdsForMember(admin, membership, accepted.map((p: any) => p.owner_user_id)))
      const clients = await Promise.all(
        accepted.filter((p: any) => visible.has(p.owner_user_id)).slice(0, 15).map(async (p: any) => {
          const facts = await portfolioFacts(admin, [p.owner_user_id], ITEM_CAP, todayKey, in30)
          if (!membership.canViewFinancials) {
            delete facts.monthlyRentRoll
            delete facts.rentByUnit
            delete facts.rentStatusThisMonth
          }
          const fee = p.management_fee_type === 'percent_of_rent'
            ? `${Number(p.management_fee_percent)}% of rent`
            : Number(p.management_fee) > 0 ? `$${Number(p.management_fee)} ${p.management_fee_frequency || ''}`.trim() : 'none set'
          return {
            ownerName: p.users?.full_name || p.users?.email || p.invited_email || 'Client',
            approvalLimit: Number(p.approval_threshold || 0),
            managementFee: fee,
            feeApprovedByOwner: !!p.fee_owner_approved_at,
            rentPaidTo: p.rent_recipient === 'pm' ? 'your company' : 'the owner',
            rentToPmRequestPending: !!p.rent_to_pm_requested_at && !p.rent_to_pm_approved_at && p.rent_recipient !== 'pm',
            ...facts,
          }
        })
      )
      const clientOwnerIds = accepted.filter((p: any) => visible.has(p.owner_user_id)).map((p: any) => p.owner_user_id)
      let jobsAwaitingApproval = 0
      if (clientOwnerIds.length) {
        const { count } = await admin
          .from('jobs')
          .select('id, units!inner(properties!inner(owner_user_id))', { count: 'exact', head: true })
          .in('units.properties.owner_user_id', clientOwnerIds)
          .eq('status', 'pending_approval')
        jobsAwaitingApproval = count || 0
      }
      return {
        isPropertyManager: true,
        company: membership.organizationName,
        yourRoleInCompany: membership.memberRole,
        canViewFinancials: membership.canViewFinancials,
        clientCount: clients.length,
        invitesAwaitingOwnerAcceptance: (portfolios || []).filter((p: any) => p.status === 'pending').length,
        jobsAwaitingApproval,
        clients,
        yourOwnProperties: own,
      }
    }
    // An owner who has hired a PM.
    const { data: managed } = await admin
      .from('pm_client_portfolios')
      .select('approval_threshold, rent_recipient, management_fee, management_fee_type, management_fee_percent, management_fee_frequency, fee_owner_approved_at, pm_organizations(name)')
      .eq('owner_user_id', userId)
      .eq('status', 'accepted')
      .maybeSingle()
    if (managed) {
      const m: any = managed
      own.managedBy = {
        company: m.pm_organizations?.name || 'your property manager',
        approvalLimit: Number(m.approval_threshold || 0),
        rentPaidTo: m.rent_recipient === 'pm' ? 'the property manager' : 'you',
        managementFee: m.management_fee_type === 'percent_of_rent' ? `${Number(m.management_fee_percent)}% of rent` : Number(m.management_fee) > 0 ? `$${Number(m.management_fee)} ${m.management_fee_frequency || ''}`.trim() : 'none set',
        feeApprovedByYou: !!m.fee_owner_approved_at,
      }
    }
    return own
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
          .select('id, unit_id, rent_amount, rent_due_day, grace_period_days, lease_end, escalation_percent, escalation_frequency_months, lease_start, units(unit_number, properties(address))')
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

    // Same escalation fields lease-qa already reads from this exact row —
    // caught live by the user: asked here, help-chat said "not sure about
    // rent increase" while the dedicated lease Q&A (reading the same
    // tenancy row) correctly knew the 7%/year terms. This wasn't a model
    // confidence issue, the data just was never fetched into this route's
    // account facts in the first place.
    const nextIncrease = nextEscalationDate((tenancy as any).lease_start, tenancy.escalation_frequency_months)

    const { data: ownerRow } = await admin.from('units').select('properties(owner_user_id)').eq('id', (tenancy as any).unit_id).maybeSingle()
    const ownerId = (ownerRow as any)?.properties?.owner_user_id
    const { data: pmRow } = ownerId
      ? await admin.from('pm_client_portfolios').select('pm_organizations(name)').eq('owner_user_id', ownerId).eq('status', 'accepted').maybeSingle()
      : { data: null }

    return {
      hasActiveLease: true,
      propertyManagedBy: (pmRow as any)?.pm_organizations?.name || null,
      propertyAddress: unit?.properties?.address || null,
      unitNumber: unit?.unit_number || null,
      monthlyRent: tenancy.rent_amount,
      rentDueDay: tenancy.rent_due_day,
      leaseEnd: tenancy.lease_end,
      rentEscalationPercent: tenancy.escalation_percent,
      rentEscalationFrequencyMonths: tenancy.escalation_frequency_months,
      nextRentIncreaseDate: nextIncrease ? nextIncrease.toISOString().slice(0, 10) : null,
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
    return NextResponse.json({ error: 'Prophandld AI is not available for this account' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Same rule every other AI feature uses: landlords and PMs on their own
  // access, renters on their landlord's, contractors during the pilot.
  const access = await aiAccessFor(supabaseAdmin, user)
  if (!access.allowed) {
    return NextResponse.json({ error: role === 'renter' ? 'Your landlord hasn’t turned on Prophandld AI yet.' : 'Turn on Prophandld AI from your Profile to use this.' }, { status: 403 })
  }
  const billedUserId = access.billedUserId

  // Generous — a real back-and-forth conversation easily runs 10+ turns —
  // but still a real ceiling against someone scripting this into a free
  // general-purpose chatbot proxy.
  if (await tooManyAiAssistRequests('help-chat', user.id, 30)) {
    return NextResponse.json({ error: 'Too many messages right now, try again in a few minutes.' }, { status: 429 })
  }

  const { history, message, stream } = (await request.json()) as { history?: ChatTurn[]; message?: string; stream?: boolean }
  if (!message?.trim() || message.length > 1000) {
    return NextResponse.json({ error: 'Message must be 1-1000 characters' }, { status: 400 })
  }
  const trimmedHistory = (history || []).slice(-8).filter((t) => t.role === 'user' || t.role === 'assistant')

  const [{ data: profile }, accountFacts] = await Promise.all([
    supabaseAdmin.from('users').select('preferred_language').eq('id', user.id).maybeSingle(),
    getAccountFacts(supabaseAdmin, authClient, user.id, role),
  ])
  const lang = profile?.preferred_language === 'es' ? 'Spanish' : 'English'
  const isPm = (accountFacts as any).isPropertyManager === true

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
      { path: '/landlord/pm', label: 'Property Management' },
      { path: '/landlord/compliance', label: 'Compliance' },
      { path: '/landlord/records', label: 'Records' },
      { path: '/landlord/documents', label: 'Documents' },
      { path: '/landlord/payouts', label: 'Payouts' },
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
      { path: '/contractor/jobs', label: 'Jobs' },
      { path: '/contractor/earnings', label: 'Earnings' },
      { path: '/contractor/calendar', label: 'Calendar' },
      { path: '/contractor/messages', label: 'Messages' },
      { path: '/profile', label: 'Profile' },
    ],
  }
  const navPathList = (NAV_PATHS[role] || []).map((n) => `${n.path} — "${n.label}"`).join('\n')

  const who = isPm ? 'property manager' : role

  const system =
    `You are Prophandld's AI assistant, talking to a signed-in ${who}. You are sharp, warm, and genuinely ` +
    'useful, like an experienced property-management colleague who also knows this app inside out.\n\n' +
    'WHAT YOU ANSWER: anything. (1) How Prophandld works, from APP KNOWLEDGE. (2) This person\'s own account, ' +
    'from ACCOUNT FACTS, stated directly by name, address, amount and date. (3) Any real-world question about ' +
    'renting, property management, maintenance and repairs, landlord-tenant law, fair housing, leases, tenant ' +
    'screening, bookkeeping and taxes for rentals, insurance, negotiating with contractors, and writing ' +
    'messages, notices or listings: give a real, specific, confident answer from RENTAL LAW FACTS and your own ' +
    'knowledge. For law or tax, add one short line that it is general information and to confirm with a local ' +
    'attorney or accountant for their exact situation; never refuse or water the answer down. (4) Arithmetic ' +
    'and estimates: just do it, labeled as calculated from what they told you. (5) Anything else (general ' +
    'knowledge, a quick fact): answer it briefly and helpfully, then you can mention you are here for anything ' +
    'property-related too.\n\n' +
    'ACCURACY: never invent a Prophandld feature, page or policy that is not in APP KNOWLEDGE, and never invent ' +
    'an account fact (address, date, amount, name) that is not in ACCOUNT FACTS. If the account data does not ' +
    'show something, say what you can see and where in the app to look. Compliance items with isOverdue true ' +
    'are expired/overdue, never merely "due". rentStatusThisMonth lists only units NOT fully paid (empty means ' +
    'everyone is current). For a Philadelphia compliance renewal, open by noting it is verified for ' +
    `Philadelphia: ${PHILADELPHIA_COMPLIANCE_FACTS}\n\n` +
    (isPm
      ? 'THIS USER IS A PROPERTY MANAGER. ACCOUNT FACTS.clients is their client list; each client has its own ' +
        'properties, units, open jobs, rent status, compliance, approval limit, management fee and where rent is ' +
        'paid. Answer portfolio questions across ALL clients, naming the client (owner) for each item. ' +
        'yourOwnProperties is only what they own personally. If canViewFinancials is false, rent figures are ' +
        'hidden for them by their company; say so if asked.\n\n'
      : '') +
    'URGENT SAFETY: for gas smell, fire, flooding, no heat in freezing weather, carbon monoxide, or electrical ' +
    'danger, lead with the immediate safety steps and the timeframe, then the rest.\n\n' +
    'PRIVACY: account facts are only this person\'s own. Never reveal or guess at any other user\'s data.\n\n' +
    'STYLE: plain, friendly, direct. Short for simple questions (1-3 sentences); for real how-to or urgent ' +
    'situations use a few short numbered steps. No markdown headings, no bold, no "As an AI". Write the reply ' +
    `in the same language the user wrote their latest message in (default ${lang}).\n\n` +
    'OUTPUT FORMAT: write the reply text only. Then, on its own final line, optionally add tags:\n' +
    '[[LINK:/exact/path]] when the answer is "go to page X", using only a path from NAVIGATION PATHS, at most one.\n' +
    '[[ESCALATE]] only when a real person is needed (a bug, a billing dispute, an account problem you cannot see).\n\n' +
    `APP KNOWLEDGE:\n${APP_KNOWLEDGE}\n\nRENTAL LAW FACTS (general information, not legal advice):\n${RENTAL_LAW_FACTS}\n\n` +
    `NAVIGATION PATHS (role: ${role}):\n${navPathList}\n\n` +
    `ACCOUNT FACTS (this signed-in user's own data, JSON; today is ${new Date().toISOString().slice(0, 10)}):\n${JSON.stringify(accountFacts)}`

  const prompt = `Conversation so far:\n${conversation}\n\nWrite the assistant's next reply.`
  const track = { billedUserId, callerUserId: user.id, feature: 'help-chat' }
  // The model ends with optional [[LINK:...]] / [[ESCALATE]] tags; these
  // become the reply's link button and "talk to a person" option.
  const finish = (raw: string) => {
    const escalate = /\[\[ESCALATE\]\]/i.test(raw)
    const linkPath = raw.match(/\[\[LINK:\s*([^\]\s]+)\s*\]\]/i)?.[1]
    const reply = raw.replace(/\[\[(?:LINK:[^\]]*|ESCALATE)\]\]/gi, '').replace(/^Assistant:\s*/i, '').replace(/\*\*(.+?)\*\*/g, '$1').trim()
    // Only a link from the real list survives, never a guessed one.
    const navLink = (NAV_PATHS[role] || []).find((n) => n.path === linkPath) || null
    return { reply, suggestEscalate: escalate, navLink }
  }

  if (stream) {
    // Text arrives as it's written. Anything from "[[" on is held back (the
    // tags), and the final cleaned reply plus link/escalate info follows a
    // \u0000 separator once the model is done.
    const encoder = new TextEncoder()
    const body = new ReadableStream({
      async start(controller) {
        let full = ''
        let sent = 0
        try {
          const raw = await claudeStream({
            system, prompt, maxTokens: 1500, model: CLAUDE_SMART_MODEL, track,
            onText: (delta) => {
              full += delta
              const tag = full.indexOf('[[')
              let safe = tag === -1 ? full.length : tag
              if (tag === -1 && full.endsWith('[')) safe -= 1
              if (safe > sent) {
                controller.enqueue(encoder.encode(full.slice(sent, safe)))
                sent = safe
              }
            },
          })
          controller.enqueue(encoder.encode('\u0000' + JSON.stringify(finish(raw))))
        } catch (err) {
          const errorRef = crypto.randomUUID().slice(0, 8)
          console.error(`ai-assist/help-chat: stream error [ref ${errorRef}]`, err)
          controller.enqueue(encoder.encode('\u0000' + JSON.stringify({ error: 'Could not respond right now. Try again in a moment.', errorRef })))
        }
        controller.close()
      },
    })
    return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } })
  }

  try {
    const raw = await claudeText({ system, prompt, maxTokens: 1500, model: CLAUDE_SMART_MODEL, raw: true, track })
    return NextResponse.json(finish(raw))
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      return NextResponse.json({ error: 'Not set up yet' }, { status: 503 })
    }
    // Caught live by a second audit: this fails intermittently across a
    // wide range of unrelated prompts (a simple unit count, a privacy
    // question) with nothing for a landlord to report beyond "Try again
    // in a moment" — same errorRef pattern already added to
    // compliance-gap-check for the same reason: a short id, logged
    // alongside the real error server-side and echoed to the client,
    // turns "it's broken" into something actually traceable.
    const errorRef = crypto.randomUUID().slice(0, 8)
    console.error(`ai-assist/help-chat: unhandled error [ref ${errorRef}]`, err)
    return NextResponse.json({ error: 'Could not respond right now. Try again in a moment.', errorRef }, { status: 500 })
  }
}
