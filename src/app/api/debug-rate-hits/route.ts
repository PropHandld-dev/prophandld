import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// TEMPORARY — diagnosing why tooManyRequests() never trips. Scoped so it can
// only ever reveal a caller's own rate-limit hit history (their own user id
// in the key), never anyone else's. Delete after the investigation.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })

  const admin = getSupabaseAdmin()
  const key = `pm-client-request:${user.id}`
  const { data: rows, error } = await admin
    .from('support_escalate_hits')
    .select('id, rate_key, created_at')
    .eq('rate_key', key)
    .order('created_at', { ascending: false })
    .limit(50)

  const { count, error: countError } = await admin
    .from('support_escalate_hits')
    .select('id', { count: 'exact', head: true })
    .eq('rate_key', key)

  return NextResponse.json({ key, rows, error, count, countError })
}
