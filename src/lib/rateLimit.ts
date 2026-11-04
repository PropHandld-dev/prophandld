import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Row-per-hit shared-table rate limiter — real (cross-instance) unlike an
// in-memory Map, which resets on cold start and shares nothing across
// serverless instances on Vercel. Reuses support_escalate_hits (same table
// help-chat's own limiter already uses) rather than a new table, keyed by
// whatever the caller wants (an IP, a user+feature pair, etc), one row per
// hit, swept of rows outside the window on every call.
export async function tooManyRequests(key: string, limit: number, windowMinutes: number): Promise<boolean> {
  const admin = getSupabaseAdmin()
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
  admin.from('support_escalate_hits').delete().lt('created_at', windowStart).then(() => {}, () => {})
  const { count } = await admin
    .from('support_escalate_hits')
    .select('id', { count: 'exact', head: true })
    .eq('rate_key', key)
    .gte('created_at', windowStart)
  await admin.from('support_escalate_hits').insert({ rate_key: key })
  return (count || 0) >= limit
}
