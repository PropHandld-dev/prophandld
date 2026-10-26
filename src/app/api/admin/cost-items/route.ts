import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { getCostItemsWithTotal } from '@/lib/costItems'

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { items, monthlyTotal, error } = await getCostItemsWithTotal(getSupabaseAdmin())
  if (error) {
    return NextResponse.json({ error: `Could not load cost items: ${error}` }, { status: 500 })
  }

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
