import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { isAdminUserId } from '@/lib/adminAccess'

// The one number on the admin dashboard that genuinely can't be computed
// from the app's own data — Vercel/Supabase/Resend/Twilio bills are paid
// outside the app entirely. Rather than let that make the "costs" section
// go stale, this is a real, editable value stored in the DB (not a
// hardcoded constant), so it can be kept current from the dashboard
// itself, right before a meeting, without a code change or a SQL editor.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await isAdminUserId(user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('admin_cost_settings')
    .select('monthly_infra_cost, updated_at')
    .eq('id', true)
    .maybeSingle()

  if (error) {
    console.error('admin/cost-settings GET: error loading', error)
    return NextResponse.json({ error: 'Could not load cost settings' }, { status: 500 })
  }

  return NextResponse.json({ monthlyInfraCost: Number(data?.monthly_infra_cost || 0), updatedAt: data?.updated_at || null })
}

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await isAdminUserId(user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { monthlyInfraCost } = (await request.json()) as { monthlyInfraCost?: number }
  if (typeof monthlyInfraCost !== 'number' || !Number.isFinite(monthlyInfraCost) || monthlyInfraCost < 0) {
    return NextResponse.json({ error: 'monthlyInfraCost must be a non-negative number' }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from('admin_cost_settings')
    .update({ monthly_infra_cost: monthlyInfraCost, updated_at: new Date().toISOString() })
    .eq('id', true)

  if (error) {
    console.error('admin/cost-settings POST: error saving', error)
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
