import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { getActionableOwnerIdsAdmin } from '@/lib/pm'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'
import { rentMonthBounds } from '@/lib/rentAutomation'

export const maxDuration = 30

// sortDays is the urgency the nudge was built from (days until a renewal/
// expiry, days a job has sat with no bids) — kept as its own field instead
// of re-extracted from `text` with a regex, which previously grabbed the
// first digit sequence in the rendered string (often a street number) and
// sorted by that instead of by actual urgency.
// href previously didn't exist at all — every nudge rendered as plain
// static text with nowhere to go, which undercuts the "feels worth
// paying for" moment this card is supposed to be: reading "Unit 4B
// renews in 12 days" and having no way to act on it right there.
type Nudge = { icon: 'calendar' | 'warning' | 'wrench'; text: string; sortDays?: number; href?: string }

// The one page the AI Features Proposal PDF called the strongest "feels
// worth paying for" moment — bundles the weekly-digest idea and proactive
// nudges into one card on the landlord dashboard. Deliberately only
// surfaces what's NOT already shown elsewhere on that dashboard (lease
// renewals, stale open jobs, predicted-lifespan flags on tracked systems)
// — compliance-expiring used to be a nudge here too, but that duplicated
// AlertsList's own compliance alerts one scroll below, so it was dropped
// from here. The nudge FACTS are plain deterministic queries, not AI —
// only the one-paragraph summary tying them together, and the lifespan
// prediction, actually call Claude.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'landlord') {
    return NextResponse.json({ enabled: false })
  }

  const supabaseAdmin = getSupabaseAdmin()
  if (!(await hasAiAssistAccess(supabaseAdmin, user.id))) {
    return NextResponse.json({ enabled: false })
  }
  if (await tooManyAiAssistRequests('portfolio-digest', user.id, 40)) {
    return NextResponse.json({ enabled: false })
  }

  try {
    // Self + co-owner primaries + any PM client portfolios this user
    // manages — but AI Assist is billed per owner by their own unit
    // count, so a client's data only belongs in this digest if that
    // specific owner has their own AI Assist access, not just because
    // the PM viewing this happens to have it. Otherwise a PM paying for
    // 1 unit of their own would get free AI coverage of every client's
    // entire portfolio, unrelated to what anyone's actually billed for.
    const actionableOwnerIds = await getActionableOwnerIdsAdmin(supabaseAdmin, user.id)
    const accessChecks = await Promise.all(actionableOwnerIds.map((id) => hasAiAssistAccess(supabaseAdmin, id)))
    const landlordIds = actionableOwnerIds.filter((_, i) => accessChecks[i])

    const { data: properties } = await supabaseAdmin.from('properties').select('id, address').in('owner_user_id', landlordIds).eq('archived', false)
    const propertyIds = (properties || []).map((p) => p.id)
    const propertyAddressById = new Map((properties || []).map((p) => [p.id, p.address]))

    if (propertyIds.length === 0) {
      return NextResponse.json({ enabled: true, summary: '', nudges: [] as Nudge[] })
    }

    const { data: units } = await supabaseAdmin.from('units').select('id, unit_number, property_id').in('property_id', propertyIds)
    const unitIds = (units || []).map((u) => u.id)
    const unitById = new Map((units || []).map((u) => [u.id, u]))

    const today = new Date()
    const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const todayKey = today.toISOString().slice(0, 10)

    const [{ data: tenancies }, { data: staleJobs }, { data: systems }, { data: activeTenancies }] = await Promise.all([
      unitIds.length > 0
        ? supabaseAdmin
            .from('tenancies')
            .select('unit_id, lease_end')
            .in('unit_id', unitIds)
            .eq('ended', false)
            .not('lease_end', 'is', null)
            .gte('lease_end', todayKey)
            .lte('lease_end', in30)
        : Promise.resolve({ data: [] }),
      unitIds.length > 0
        ? supabaseAdmin
            .from('jobs')
            .select('id, category, created_at, unit_id, bids(id)')
            .in('unit_id', unitIds)
            .eq('status', 'open')
        : Promise.resolve({ data: [] }),
      unitIds.length > 0
        ? supabaseAdmin
            .from('maintenance_items')
            .select('name, item_type, install_date, unit_id')
            .in('unit_id', unitIds)
            .not('install_date', 'is', null)
        : Promise.resolve({ data: [] }),
      // Separate from the lease-renewal query above — this one's
      // unfiltered by lease_end, since late rent doesn't care how far off
      // the lease end date is.
      unitIds.length > 0
        ? supabaseAdmin.from('tenancies').select('id, unit_id, rent_due_day, grace_period_days').in('unit_id', unitIds).eq('ended', false)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const nudges: Nudge[] = []

    // Late rent — the strongest "feels worth paying for" signal this card
    // was missing entirely: a flagged earlier gap, closed now that the
    // same paid-vs-expected + grace-period check already built for
    // help-chat's rentStatusThisMonth exists to reuse.
    if ((activeTenancies || []).length > 0) {
      const { month: thisMonth, following: nextMonth, firstDate } = rentMonthBounds(0)
      const tenancyIds = (activeTenancies || []).map((t: any) => t.id)
      const { data: currentPayments } = await supabaseAdmin
        .from('rent_payments')
        .select('tenancy_id, expected_amount, actual_amount')
        .in('tenancy_id', tenancyIds)
        .gte('month', thisMonth)
        .lt('month', nextMonth)
      const paymentByTenancy = new Map((currentPayments || []).map((p: any) => [p.tenancy_id, p]))
      for (const tenancy of activeTenancies || []) {
        const payment = paymentByTenancy.get(tenancy.id)
        if (!payment) continue
        const expected = Number(payment.expected_amount || 0)
        const paid = Number(payment.actual_amount || 0)
        if (paid >= expected) continue
        const dueDate = new Date(firstDate.getFullYear(), firstDate.getMonth(), tenancy.rent_due_day ?? 1)
        const daysSinceDue = Math.floor((today.getTime() - dueDate.getTime()) / 86400000)
        if (daysSinceDue < (tenancy.grace_period_days ?? 5)) continue
        const unit: any = unitById.get(tenancy.unit_id)
        const address = unit ? propertyAddressById.get(unit.property_id) : null
        const label = unit?.unit_number ? `${address}, Unit ${unit.unit_number}` : address
        nudges.push({
          icon: 'warning',
          text: `${label} is ${daysSinceDue} day${daysSinceDue === 1 ? '' : 's'} late on rent`,
          sortDays: -1000 - daysSinceDue,
          href: unit ? `/landlord/properties/${unit.property_id}/units/${unit.id}/rent` : undefined,
        })
      }
    }

    for (const t of tenancies || []) {
      const unit: any = unitById.get(t.unit_id)
      const address = unit ? propertyAddressById.get(unit.property_id) : null
      const label = unit?.unit_number ? `${address}, Unit ${unit.unit_number}` : address
      const days = Math.round((new Date(t.lease_end + 'T00:00:00').getTime() - today.getTime()) / 86400000)
      nudges.push({
        icon: 'calendar',
        text: `${label} renews in ${days} day${days === 1 ? '' : 's'}`,
        sortDays: days,
        href: unit ? `/landlord/properties/${unit.property_id}/units/${unit.id}/tenancy/edit` : undefined,
      })
    }

    // Compliance-expiring used to be its own nudge here too, computed from
    // a plain fixed 30-day window — but the dashboard's AlertsList already
    // shows the exact same fact, per item's own custom reminder_days
    // threshold, with a direct link, right below this card. Landlords were
    // seeing the same expiring-license fact twice in two different visual
    // styles back to back, which read as clutter rather than two real
    // signals. Dropped here; AlertsList stays the one place for it.

    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    for (const j of staleJobs || []) {
      const bidCount = Array.isArray((j as any).bids) ? (j as any).bids.length : 0
      if (bidCount > 0) continue
      const createdAt = new Date(j.created_at)
      if (createdAt > sevenDaysAgo) continue
      const days = Math.round((today.getTime() - createdAt.getTime()) / 86400000)
      nudges.push({ icon: 'wrench', text: `${j.category} job open ${days} days, no bids yet`, sortDays: -days, href: `/landlord/jobs/${j.id}` })
    }

    // Predictive maintenance — the only one of the four nudge sources that
    // isn't a deterministic query, since "is this past typical lifespan"
    // needs the model's general knowledge of appliance/system lifespans,
    // not data the app has. Still padded conservatively in the prompt
    // (only flag it if genuinely at or past typical lifespan) so this
    // doesn't turn into a nag about anything merely a few years old.
    if ((systems || []).length > 0) {
      try {
        const ages = (systems || []).map((s) => ({
          name: s.name,
          item_type: s.item_type,
          years_since_install: Math.floor((today.getTime() - new Date(s.install_date + 'T00:00:00').getTime()) / (365.25 * 86400000)),
        }))
        const lifespanResult = await claudeJson<{ flagged: { name: string; note: string }[] }>({
          system:
            'You know typical lifespans for home systems/appliances (water heater ~10-13yr, HVAC ~15-20yr, ' +
            'roof ~20-25yr, refrigerator ~10-15yr, washer/dryer ~10-13yr, etc). Given a list of tracked items ' +
            'with their type and age, flag ONLY the ones at or past typical lifespan for their type — be ' +
            'conservative, most items should not be flagged. For an item_type you don\'t have confident general ' +
            'knowledge about, skip it rather than guessing.',
          prompt: `Items: ${JSON.stringify(ages)}\n\nReturn JSON: { "flagged": [{ "name": string, "note": string }] } — note is one short plain sentence.`,
          // Same multi-item truncation risk confirmed live on
          // compliance-gap-check's near-identical shape (an array of
          // {name, note} items) — 400 wasn't enough once more than one
          // system gets flagged.
          maxTokens: 700,
          track: { billedUserId: user.id, callerUserId: user.id, feature: 'portfolio-digest' },
        })
        for (const f of lifespanResult.flagged || []) {
          const matchedSystem = (systems || []).find((s) => s.name === f.name)
          const unit: any = matchedSystem ? unitById.get(matchedSystem.unit_id) : null
          nudges.push({
            icon: 'warning',
            text: f.note,
            href: unit ? `/landlord/properties/${unit.property_id}/units/${unit.id}/systems` : undefined,
          })
        }
      } catch (err) {
        console.error('ai-assist/portfolio-digest: lifespan check failed', err)
      }
    }

    // Cap and sort by "most time-sensitive first" — the dashboard card is
    // only ever glanced at, not read end to end. Lifespan flags carry no
    // day count, so they sort to the back.
    nudges.sort((a, b) => (a.sortDays ?? 999) - (b.sortDays ?? 999))
    const topNudges = nudges.slice(0, 6)

    if (topNudges.length === 0) {
      return NextResponse.json({ enabled: true, summary: '', nudges: [] as Nudge[] })
    }

    let summary = ''
    try {
      const result = await claudeJson<{ summary: string }>({
        system:
          'You write a one or two sentence plain-English summary of a landlord\'s portfolio status for a ' +
          'property management app dashboard, from a list of facts already gathered. Friendly, concrete, no ' +
          'fluff, no markdown. Mention 2-3 of the most time-sensitive items by name if there are several.',
        prompt: `Facts:\n${topNudges.map((n) => `- ${n.text}`).join('\n')}\n\nReturn JSON: { "summary": string }`,
        // Same truncation risk fixed elsewhere today (compliance-gap-check,
        // draft-message, lease-qa) — naming 2-3 items across 1-2 sentences
        // is more than 200 reliably covers.
        maxTokens: 400,
        track: { billedUserId: user.id, callerUserId: user.id, feature: 'portfolio-digest' },
      })
      summary = result.summary
    } catch (err) {
      // The nudge list itself is real, deterministic data — still worth
      // returning even if the narrative summary call fails.
      console.error('ai-assist/portfolio-digest: summary generation failed', err)
    }

    return NextResponse.json({ enabled: true, summary, nudges: topNudges })
  } catch (err) {
    if (err instanceof ClaudeConfigError) {
      return NextResponse.json({ enabled: true, summary: '', nudges: [] as Nudge[] })
    }
    console.error('ai-assist/portfolio-digest: unhandled error', err)
    return NextResponse.json({ error: 'Could not load portfolio digest' }, { status: 500 })
  }
}
