import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { getTwilioClient } from '@/lib/sms'

// Confirmed live (2026-10-26): Twilio's own Usage Records API, category
// 'totalprice', returns the account's real spend since startDate — no new
// credential needed, reuses the same TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN
// already configured for SMS sending. `price` comes back negative (a
// debit); shown here as a positive cost like every other line item.
// Resend and Sentry don't get the same treatment: Resend's usage API is
// still private beta and returns email counts, not a dollar figure;
// Sentry has no documented endpoint that returns one at all — both stay
// manual rather than ship something likely to misreport or break.
async function fetchLiveTwilioCost(): Promise<number | null> {
  if (!process.env.TWILIO_ACCOUNT_SID?.trim() || !process.env.TWILIO_AUTH_TOKEN?.trim()) return null
  try {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const records = await getTwilioClient().usage.records.list({ category: 'totalprice', startDate: startOfMonth })
    const total = records.reduce((sum, r) => sum + Math.abs(Number(r.price) || 0), 0)
    return total
  } catch (err) {
    console.error('admin/cost-items: live Twilio usage fetch failed', err)
    return null
  }
}

// Monthly-equivalent contribution to the recurring burn rate: a true
// one-time cost (Google Play's $25 registration) never recurs, so it's
// excluded entirely; an annual cost (the domain, Apple's $99/year) is
// amortized over 12 months so it still shows up in the number that
// actually matters for a monthly net-margin conversation.
function monthlyEquivalent(amount: number, frequency: string) {
  if (frequency === 'annual') return amount / 12
  if (frequency === 'one_time') return 0
  return amount
}

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('admin_cost_items')
    .select('id, label, category, pricing_note, billing_url, monthly_estimate, billing_frequency, sort_order, updated_at')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('admin/cost-items GET: error loading', error)
    return NextResponse.json({ error: `Could not load cost items: ${error.message}` }, { status: 500 })
  }

  const liveTwilioCost = await fetchLiveTwilioCost()

  const items = (data || []).map((item) =>
    item.id === 'twilio' && liveTwilioCost !== null
      ? { ...item, monthly_estimate: liveTwilioCost, live: true }
      : { ...item, live: false }
  )
  const monthlyTotal = items.reduce((sum, i) => sum + monthlyEquivalent(Number(i.monthly_estimate) || 0, i.billing_frequency), 0)

  return NextResponse.json({ items, monthlyTotal })
}

export async function PATCH(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { id, monthlyEstimate, billingUrl } = (await request.json()) as {
    id?: string
    monthlyEstimate?: number
    billingUrl?: string
  }
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (monthlyEstimate !== undefined) {
    if (typeof monthlyEstimate !== 'number' || !Number.isFinite(monthlyEstimate) || monthlyEstimate < 0) {
      return NextResponse.json({ error: 'monthlyEstimate must be a non-negative number' }, { status: 400 })
    }
    update.monthly_estimate = monthlyEstimate
  }
  if (billingUrl !== undefined) {
    update.billing_url = billingUrl.trim() || null
  }

  const { error } = await getSupabaseAdmin().from('admin_cost_items').update(update).eq('id', id)
  if (error) {
    console.error('admin/cost-items PATCH: error saving', error)
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
