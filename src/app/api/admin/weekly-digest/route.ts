import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { getWeeklyDigestData } from '@/lib/weeklyDigestData'

// Built for the weekly 3-person meeting (Nevin/Joshua/James) — one page
// answering "what happened this week" and "what needs a decision from us
// right now", so the meeting can run off this instead of each person
// checking a different admin tab first. Every number here is computed
// live from real tables; nothing here is simulated or invented (no
// cron-health tracking, for example — that table doesn't exist).
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const result = await getWeeklyDigestData(getSupabaseAdmin())
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json(result)
}
