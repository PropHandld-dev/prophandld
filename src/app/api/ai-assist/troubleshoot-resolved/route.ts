import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Fires once, right when TroubleshootAssistant's onDone('resolved', ...)
// confirms a renter fixed their own issue with no contractor needed — the
// one place this gets recorded at all, since this never becomes a job.
// Purely a landlord-facing value-proof stat (see
// 2026-11-02-ai-troubleshoot-resolutions.sql); failing silently here
// should never block the renter's actual flow, so the caller treats a
// failed POST as non-fatal.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'renter') {
    return NextResponse.json({ error: 'Only renters can log this' }, { status: 403 })
  }

  const { category } = (await request.json().catch(() => ({}))) as { category?: string }
  if (!category) {
    return NextResponse.json({ error: 'Missing category' }, { status: 400 })
  }

  // get_my_active_tenancy_id() covers the co-renter case via
  // tenancy_occupants, same fix already applied to renter-status/lease-qa/
  // troubleshoot.
  const { data: tenancyId } = await authClient.rpc('get_my_active_tenancy_id')
  if (!tenancyId) {
    return NextResponse.json({ error: 'No active lease found' }, { status: 404 })
  }

  const admin = getSupabaseAdmin()
  const { data: tenancy } = await admin.from('tenancies').select('unit_id').eq('id', tenancyId).maybeSingle()
  if (!tenancy) {
    return NextResponse.json({ error: 'No active lease found' }, { status: 404 })
  }

  const { data: unit } = await admin.from('units').select('property_id').eq('id', tenancy.unit_id).maybeSingle()
  if (!unit?.property_id) {
    return NextResponse.json({ error: 'Could not resolve property' }, { status: 404 })
  }

  const { error } = await admin.from('ai_troubleshoot_resolutions').insert({
    unit_id: tenancy.unit_id,
    property_id: unit.property_id,
    renter_user_id: user.id,
    category,
  })
  if (error) {
    console.error('troubleshoot-resolved: insert failed', error)
    return NextResponse.json({ error: 'Could not log this' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
