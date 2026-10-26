import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'

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
    return NextResponse.json({ error: 'Could not load cost items' }, { status: 500 })
  }

  const items = data || []
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
