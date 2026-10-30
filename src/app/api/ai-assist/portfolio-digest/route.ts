import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { claudeJson, ClaudeConfigError } from '@/lib/claude'

export const maxDuration = 30

// sortDays is the urgency the nudge was built from (days until a renewal/
// expiry, days a job has sat with no bids) — kept as its own field instead
// of re-extracted from `text` with a regex, which previously grabbed the
// first digit sequence in the rendered string (often a street number) and
// sorted by that instead of by actual urgency.
type Nudge = { icon: 'calendar' | 'warning' | 'wrench'; text: string; sortDays?: number }

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
    // getLandlordIds' my_landlord_ids() RPC resolves off auth.uid(), which
    // is unset under the service-role admin client used here — scoped to
    // this landlord's own properties only, not co-owned ones, same
    // graceful fallback getLandlordIds itself would take in that case.
    const landlordIds = [user.id]

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

    const [{ data: tenancies }, { data: staleJobs }, { data: systems }] = await Promise.all([
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
    ])

    const nudges: Nudge[] = []

    for (const t of tenancies || []) {
      const unit: any = unitById.get(t.unit_id)
      const address = unit ? propertyAddressById.get(unit.property_id) : null
      const label = unit?.unit_number ? `${address}, Unit ${unit.unit_number}` : address
      const days = Math.round((new Date(t.lease_end + 'T00:00:00').getTime() - today.getTime()) / 86400000)
      nudges.push({ icon: 'calendar', text: `${label} renews in ${days} day${days === 1 ? '' : 's'}`, sortDays: days })
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
      nudges.push({ icon: 'wrench', text: `${j.category} job open ${days} days, no bids yet`, sortDays: -days })
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
          maxTokens: 400,
          track: { billedUserId: user.id, callerUserId: user.id, feature: 'portfolio-digest' },
        })
        for (const f of lifespanResult.flagged || []) {
          nudges.push({ icon: 'warning', text: f.note })
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
        maxTokens: 200,
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
