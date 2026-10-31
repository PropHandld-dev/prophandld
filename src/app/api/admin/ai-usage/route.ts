import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { fetchAllPagesOrEmpty } from '@/lib/pagedQuery'

// Cost per landlord and per feature, from the real ai_usage_log rows every
// claudeJson() call writes (src/lib/claude.ts) — the actual numbers behind
// the worst-case estimates in the AI Features Proposal PDF. Aggregated in
// JS rather than a SQL view: the table stays small even at real usage (see
// the proposal's own cost-at-scale math), so there's no real cost to
// fetching raw rows and summing here instead of maintaining a view.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  try {
    const rows = await fetchAllPagesOrEmpty<any>((from, to) =>
      supabaseAdmin
        .from('ai_usage_log')
        .select('billed_user_id, caller_user_id, feature, input_tokens, output_tokens, cost_usd, created_at')
        .order('created_at', { ascending: false })
        .range(from, to)
    )

    const billedIds = Array.from(new Set((rows || []).map((r) => r.billed_user_id).filter(Boolean)))
    const nameById = new Map<string, { name: string; email: string }>()
    await Promise.all(
      billedIds.map(async (id) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(id)
        if (data?.user) nameById.set(id, { name: data.user.user_metadata?.full_name || data.user.email || 'Unknown', email: data.user.email || '' })
      })
    )

    // help-chat is the one feature that intentionally bills no one (free
    // platform support regardless of AI Assist — see claude.ts/help-chat's
    // own comments), so it's the only feature with a null billed_user_id.
    // Excluding it (rather than excluding by feature name) is what makes
    // "AI Assist cost" below actually mean AI Assist, not total Claude
    // spend including the always-free assistant.
    const byUser = new Map<string, { userId: string; name: string; email: string; cost: number; calls: number; tokens: number }>()
    const byFeature = new Map<string, { feature: string; cost: number; calls: number }>()
    const byDay = new Map<string, { cost: number; calls: number }>()
    let totalCost = 0
    let totalCalls = 0
    let aiAssistCost = 0
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    let last30DaysCost = 0

    for (const r of rows || []) {
      const cost = Number(r.cost_usd) || 0
      totalCost += cost
      totalCalls += 1
      if (r.billed_user_id) aiAssistCost += cost
      if (new Date(r.created_at).getTime() >= thirtyDaysAgo) last30DaysCost += cost

      const featureKey = r.feature || 'unknown'
      const f = byFeature.get(featureKey) || { feature: featureKey, cost: 0, calls: 0 }
      f.cost += cost
      f.calls += 1
      byFeature.set(featureKey, f)

      const uid = r.billed_user_id
      if (uid) {
        const u = byUser.get(uid) || { userId: uid, name: nameById.get(uid)?.name || 'Unknown', email: nameById.get(uid)?.email || '', cost: 0, calls: 0, tokens: 0 }
        u.cost += cost
        u.calls += 1
        u.tokens += (r.input_tokens || 0) + (r.output_tokens || 0)
        byUser.set(uid, u)
      }

      const dayKey = new Date(r.created_at).toISOString().slice(0, 10)
      const d = byDay.get(dayKey) || { cost: 0, calls: 0 }
      d.cost += cost
      d.calls += 1
      byDay.set(dayKey, d)
    }

    // Zero-filled last 30 days, oldest first — a day with no calls is a
    // real, meaningful point on the trend (not a gap to skip), and the
    // admin reading this wants to see a spike against a flat baseline, not
    // guess whether a missing day means "zero" or "not loaded yet."
    const dailyTrend: { date: string; cost: number; calls: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      const entry = byDay.get(key)
      dailyTrend.push({ date: key, cost: entry?.cost || 0, calls: entry?.calls || 0 })
    }

    // "Paying" means actually billed (status active), not trialing — a
    // trial lands real Claude cost with zero revenue behind it yet, so
    // blending it into the margin number would make AI Assist look worse
    // than it actually is once a trial converts. Reported alongside the
    // trialing count instead of hidden inside it.
    const { data: subs } = await supabaseAdmin
      .from('ai_assist_subscriptions')
      .select('status, free_forever')
    const payingLandlordCount = (subs || []).filter((s: any) => s.status === 'active' && !s.free_forever).length
    const trialingLandlordCount = (subs || []).filter((s: any) => s.status === 'trialing' && !s.free_forever).length
    const costPerPayingLandlord = payingLandlordCount > 0 ? aiAssistCost / payingLandlordCount : null

    return NextResponse.json({
      totalCost,
      totalCalls,
      last30DaysCost,
      aiAssistCost,
      payingLandlordCount,
      trialingLandlordCount,
      costPerPayingLandlord,
      dailyTrend,
      byUser: Array.from(byUser.values()).sort((a, b) => b.cost - a.cost),
      byFeature: Array.from(byFeature.values()).sort((a, b) => b.cost - a.cost),
    })
  } catch (err) {
    console.error('admin/ai-usage: unhandled error', err)
    return NextResponse.json({ error: 'Could not load AI usage' }, { status: 500 })
  }
}
