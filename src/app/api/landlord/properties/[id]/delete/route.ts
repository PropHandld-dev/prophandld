import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Permanently removes a property and everything under it. Archive is the
// safe/reversible action surfaced everywhere else in the app — this is the
// one genuine hard-delete path, so every dependent table is cleared
// explicitly in FK-safe order rather than relying on unverified cascade
// behavior (same reasoning as the account-cleanup scripts run manually
// against this schema).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: property, error: propertyError } = await supabaseAdmin
    .from('properties')
    .select('id, owner_user_id')
    .eq('id', propertyId)
    .maybeSingle()

  if (propertyError || !property || property.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }

  const { data: units } = await supabaseAdmin.from('units').select('id').eq('property_id', propertyId)
  const unitIds = (units || []).map((u) => u.id)

  const { data: tenancies } = unitIds.length
    ? await supabaseAdmin.from('tenancies').select('id').in('unit_id', unitIds)
    : { data: [] as { id: string }[] }
  const tenancyIds = (tenancies || []).map((t) => t.id)

  const { data: jobs } = unitIds.length
    ? await supabaseAdmin.from('jobs').select('id').in('unit_id', unitIds)
    : { data: [] as { id: string }[] }
  const jobIds = (jobs || []).map((j) => j.id)

  if (jobIds.length) {
    await supabaseAdmin.from('contractor_reviews').delete().in('job_id', jobIds)
    await supabaseAdmin.from('job_photos').delete().in('job_id', jobIds)
    await supabaseAdmin.from('bids').delete().in('job_id', jobIds)
    await supabaseAdmin.from('messages').delete().in('job_id', jobIds)
    await supabaseAdmin.from('jobs').delete().in('id', jobIds)
  }

  if (tenancyIds.length) {
    await supabaseAdmin.from('rent_payments').delete().in('tenancy_id', tenancyIds)
  }
  if (unitIds.length) {
    await supabaseAdmin.from('tenancy_invites').delete().in('unit_id', unitIds)
    await supabaseAdmin.from('tenancies').delete().in('unit_id', unitIds)
    await supabaseAdmin.from('maintenance_items').delete().in('unit_id', unitIds)
  }

  await supabaseAdmin.from('documents').delete().eq('property_id', propertyId)
  await supabaseAdmin.from('compliance_items').delete().eq('property_id', propertyId)
  await supabaseAdmin.from('contacts').delete().eq('property_id', propertyId)
  await supabaseAdmin.from('property_roles').delete().eq('property_id', propertyId)

  if (unitIds.length) {
    await supabaseAdmin.from('units').delete().eq('property_id', propertyId)
  }

  const { error: deletePropertyError } = await supabaseAdmin.from('properties').delete().eq('id', propertyId)

  if (deletePropertyError) {
    console.error('property delete: final delete failed', deletePropertyError)
    return NextResponse.json({ error: deletePropertyError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
