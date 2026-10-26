import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getWeeklyDigestData } from '@/lib/weeklyDigestData'
import { sendWeeklyDigestAdminEmail } from '@/lib/email'

export const maxDuration = 60

// Emails the same numbers /admin/weekly already computes (see
// getWeeklyDigestData), so the Monday meeting starts from an email
// already in the inbox instead of someone remembering to go check the
// page first. Runs Monday morning — see vercel.json.
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const digest = await getWeeklyDigestData(getSupabaseAdmin())
  if (digest.error || !digest.signups) {
    console.error('cron/weekly-digest: could not compute digest data', digest.error)
    return NextResponse.json({ error: digest.error || 'Could not compute digest data' }, { status: 500 })
  }

  const {
    signups,
    properties,
    units,
    jobsCompleted,
    rentCollected,
    mrr,
    infraCostMonthly,
    netMarginMonthly,
    openDisputes,
    pendingVerifications,
  } = digest

  const result = await sendWeeklyDigestAdminEmail({
    signups,
    properties,
    units,
    jobsCompleted,
    rentCollected,
    mrr,
    infraCostMonthly,
    netMarginMonthly,
    openDisputes,
    pendingVerifications,
  }).catch((err) => {
    console.error('cron/weekly-digest: email failed', err)
    return { ok: false as const, error: err }
  })

  if (!result.ok) {
    return NextResponse.json({ error: 'Email failed to send' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
