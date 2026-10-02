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

  // Same leak account deletion had until this session's fix: real files
  // in Supabase Storage were never removed alongside the DB rows that
  // reference them. A removal failing is never worth blocking the delete
  // over, only logging.
  const removeStorageFiles = async (bucket: string, paths: (string | null | undefined)[]) => {
    const clean = paths.filter((p): p is string => Boolean(p))
    if (!clean.length) return
    const { error } = await supabaseAdmin.storage.from(bucket).remove(clean)
    if (error) console.error(`property delete: could not remove files from ${bucket}`, { propertyId, error })
  }

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
    // disputes and job_questions both reference job_id and have to clear
    // before jobs itself — a property that's ever had either (realistic
    // for any property with real history) otherwise fails the jobs
    // delete below with a raw FK-violation error. Same ordering bug
    // account deletion had until it was fixed this session.
    await supabaseAdmin.from('disputes').delete().in('job_id', jobIds)
    await supabaseAdmin.from('job_questions').delete().in('job_id', jobIds)
    await supabaseAdmin.from('contractor_reviews').delete().in('job_id', jobIds)
    const { data: jobPhotos } = await supabaseAdmin.from('job_photos').select('photo_url').in('job_id', jobIds)
    await removeStorageFiles('job-photos', (jobPhotos || []).map((p) => p.photo_url))
    await supabaseAdmin.from('job_photos').delete().in('job_id', jobIds)
    await supabaseAdmin.from('bids').delete().in('job_id', jobIds)
    await supabaseAdmin.from('messages').delete().in('job_id', jobIds)
    await supabaseAdmin.from('jobs').delete().in('id', jobIds)
  }

  if (tenancyIds.length) {
    await supabaseAdmin.from('rent_payments').delete().in('tenancy_id', tenancyIds)
    await supabaseAdmin.from('tenancy_occupants').delete().in('tenancy_id', tenancyIds)
  }
  if (unitIds.length) {
    await supabaseAdmin.from('tenancy_invites').delete().in('unit_id', unitIds)
    await supabaseAdmin.from('tenancies').delete().in('unit_id', unitIds)

    // appliance_service_log references maintenance_items.id, not unit_id
    // directly — has to clear first or any unit with service history
    // fails the maintenance_items delete right after.
    const { data: maintenanceItems } = await supabaseAdmin.from('maintenance_items').select('id').in('unit_id', unitIds)
    const maintenanceItemIds = (maintenanceItems || []).map((m) => m.id)
    if (maintenanceItemIds.length) {
      await supabaseAdmin.from('appliance_service_log').delete().in('appliance_id', maintenanceItemIds)
    }
    await supabaseAdmin.from('maintenance_items').delete().in('unit_id', unitIds)

    // Same shape: inspection_photos references move_in_inspections.id,
    // and that table itself references unit_id — both have to clear
    // before units deletes further down, or any unit with a move-in/
    // move-out inspection on file blocks the whole deletion.
    const { data: inspections } = await supabaseAdmin.from('move_in_inspections').select('id').in('unit_id', unitIds)
    const inspectionIds = (inspections || []).map((i) => i.id)
    if (inspectionIds.length) {
      const { data: inspectionPhotos } = await supabaseAdmin.from('inspection_photos').select('photo_url').in('inspection_id', inspectionIds)
      await removeStorageFiles('inspection-photos', (inspectionPhotos || []).map((p) => p.photo_url))
      await supabaseAdmin.from('inspection_photos').delete().in('inspection_id', inspectionIds)
    }
    await supabaseAdmin.from('move_in_inspections').delete().in('unit_id', unitIds)
  }

  const { data: propertyDocs } = await supabaseAdmin.from('documents').select('file_url').eq('property_id', propertyId)
  await removeStorageFiles('documents', (propertyDocs || []).map((d) => d.file_url))
  await supabaseAdmin.from('documents').delete().eq('property_id', propertyId)
  await supabaseAdmin.from('compliance_items').delete().eq('property_id', propertyId)
  await supabaseAdmin.from('contacts').delete().eq('property_id', propertyId)
  await supabaseAdmin.from('property_roles').delete().eq('property_id', propertyId)

  if (unitIds.length) {
    await supabaseAdmin.from('units').delete().eq('property_id', propertyId)
  }

  const { error: deletePropertyError } = await supabaseAdmin.from('properties').delete().eq('id', propertyId)

  if (deletePropertyError) {
    console.error('property delete: final delete failed', { propertyId, deletePropertyError })
    // Raw FK-violation messages name real table/constraint internals —
    // meaningful for debugging, not for the landlord who just clicked
    // delete. Full detail stays in the server log above either way.
    return NextResponse.json(
      { error: "Something is still linked to this property that we didn't expect. Contact admin@prophandld.com and we'll clear it manually." },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
