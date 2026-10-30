import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Shared by every AI Assist route that spends real Anthropic tokens, so a
// trial-period landlord (zero revenue to Prophandld so far, since this is a
// flat monthly/trial fee, not metered usage) can't script a loop against
// the priciest ones (document extraction, lease Q&A) at unbounded real
// cost. Reuses support_escalate_hits (same table help-chat's own limiter
// already uses), one row per hit, keyed by feature so each route gets its
// own independent bucket. Generous limits — a landlord genuinely working
// through several documents or a back-and-forth lease Q&A session easily
// makes a dozen+ calls — this is a ceiling against scripting, not a normal
// usage cap.
export async function tooManyAiAssistRequests(feature: string, userId: string, limit = 20, windowMinutes = 15): Promise<boolean> {
  const admin = getSupabaseAdmin()
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
  const key = `${feature}:${userId}`
  admin.from('support_escalate_hits').delete().lt('created_at', windowStart).then(() => {}, () => {})
  const { count } = await admin
    .from('support_escalate_hits')
    .select('id', { count: 'exact', head: true })
    .eq('rate_key', key)
    .gte('created_at', windowStart)
  await admin.from('support_escalate_hits').insert({ rate_key: key })
  return (count || 0) >= limit
}
