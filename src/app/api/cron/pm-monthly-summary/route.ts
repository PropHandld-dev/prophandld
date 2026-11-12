import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getClientMonthTotals } from '@/lib/pmStatement'
import { sendPmMonthlySummaryEmail } from '@/lib/email'
import { emailAllowed } from '@/lib/notificationPrefs'

export const maxDuration = 60

// Runs on the 1st of each month (see vercel.json), covering the month
// that just ended -- an owner opted into this (via their PM admin, see
// monthly_summary_enabled's own column comment) gets the same numbers
// the Statement page already computes, without having to log in and
// pull it themselves.
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const now = new Date()
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const month = lastMonthDate.toISOString().slice(0, 7)
  const monthLabel = lastMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const { data: portfolios, error } = await admin
    .from('pm_client_portfolios')
    .select('id, owner_user_id, pm_organizations(name), users(full_name, email, preferred_language, email_notifications_enabled)')
    .eq('status', 'accepted')
    .eq('monthly_summary_enabled', true)

  if (error) {
    console.error('cron/pm-monthly-summary: could not load portfolios', error)
    return NextResponse.json({ error: 'Could not load portfolios' }, { status: 500 })
  }

  let sent = 0
  for (const p of (portfolios || []) as any[]) {
    const owner = p.users
    if (!owner?.email || !emailAllowed(owner)) continue
    try {
      const totals = await getClientMonthTotals(admin, p.owner_user_id, month)
      await sendPmMonthlySummaryEmail({
        to: owner.email,
        ownerName: owner.full_name || 'there',
        pmOrgName: p.pm_organizations?.name || 'Your property manager',
        monthLabel,
        totalIncome: totals.totalIncome,
        totalExpenses: totals.totalExpenses,
        net: totals.net,
        lang: owner.preferred_language === 'es' ? 'es' : 'en',
      })
      sent++
    } catch (err) {
      console.error('cron/pm-monthly-summary: failed for portfolio', p.id, err)
    }
  }

  return NextResponse.json({ ok: true, sent, totalEligible: (portfolios || []).length })
}
