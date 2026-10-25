import type { SupabaseClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'
import { logAdminAudit } from '@/lib/auditLog'

// Extracted from the self-service account-delete route (api/account/delete)
// so an admin-driven deletion (e.g. cleaning up a leftover linked-profile
// test account) can reuse the exact same, already-proven cascade instead of
// a second copy that could drift out of sync with it. Deletes everything
// the account owns, in FK-safe order, then the auth user itself — not a
// soft-delete/anonymize model, consistent with how this app's data has
// been treated everywhere else.
export async function deleteAccountCascade(
  supabaseAdmin: SupabaseClient,
  userId: string,
  role: string | undefined,
  audit: { actorEmail?: string | null; targetEmail?: string | null; detail: Record<string, unknown> }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const removeStorageFiles = async (bucket: string, paths: (string | null | undefined)[]) => {
    const clean = paths.filter((p): p is string => Boolean(p))
    if (!clean.length) return
    const { error } = await supabaseAdmin.storage.from(bucket).remove(clean)
    if (error) console.error(`deleteAccountCascade: could not remove files from ${bucket}`, { userId, error })
  }

  try {
    if (role === 'landlord') {
      const { data: properties } = await supabaseAdmin.from('properties').select('id').eq('owner_user_id', userId)
      const propertyIds = (properties || []).map((p) => p.id)

      if (propertyIds.length) {
        const { data: units } = await supabaseAdmin.from('units').select('id').in('property_id', propertyIds)
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

          const { data: maintenanceItems } = await supabaseAdmin.from('maintenance_items').select('id').in('unit_id', unitIds)
          const maintenanceItemIds = (maintenanceItems || []).map((m) => m.id)
          if (maintenanceItemIds.length) {
            await supabaseAdmin.from('appliance_service_log').delete().in('appliance_id', maintenanceItemIds)
          }
          await supabaseAdmin.from('maintenance_items').delete().in('unit_id', unitIds)

          const { data: inspections } = await supabaseAdmin.from('move_in_inspections').select('id').in('unit_id', unitIds)
          const inspectionIds = (inspections || []).map((i) => i.id)
          if (inspectionIds.length) {
            const { data: inspectionPhotos } = await supabaseAdmin.from('inspection_photos').select('photo_url').in('inspection_id', inspectionIds)
            await removeStorageFiles('inspection-photos', (inspectionPhotos || []).map((p) => p.photo_url))
            await supabaseAdmin.from('inspection_photos').delete().in('inspection_id', inspectionIds)
          }
          await supabaseAdmin.from('move_in_inspections').delete().in('unit_id', unitIds)
        }
        const { data: propertyDocs } = await supabaseAdmin.from('documents').select('file_url').in('property_id', propertyIds)
        await removeStorageFiles('documents', (propertyDocs || []).map((d) => d.file_url))
        await supabaseAdmin.from('documents').delete().in('property_id', propertyIds)
        await supabaseAdmin.from('compliance_items').delete().in('property_id', propertyIds)
        await supabaseAdmin.from('contacts').delete().in('property_id', propertyIds)
        await supabaseAdmin.from('property_roles').delete().in('property_id', propertyIds)
        if (unitIds.length) {
          await supabaseAdmin.from('units').delete().in('property_id', propertyIds)
        }
        const { error: propertiesDeleteError } = await supabaseAdmin.from('properties').delete().in('id', propertyIds)
        if (propertiesDeleteError) {
          console.error('deleteAccountCascade: could not delete properties', { userId, propertyIds, propertiesDeleteError })
          return { ok: false, error: "Something is still linked to this account's properties that wasn't expected.", status: 500 }
        }
      }
      const { data: subscription } = await supabaseAdmin
        .from('landlord_subscriptions')
        .select('stripe_subscription_id')
        .eq('landlord_user_id', userId)
        .maybeSingle()
      if (subscription?.stripe_subscription_id) {
        try {
          await getStripe().subscriptions.cancel(subscription.stripe_subscription_id)
        } catch (err) {
          console.error('deleteAccountCascade: could not cancel Stripe subscription', { userId, err })
        }
      }
      await supabaseAdmin.from('landlord_subscriptions').delete().eq('landlord_user_id', userId)
      await supabaseAdmin.from('landlord_co_owners').delete().eq('primary_landlord_user_id', userId)
      await supabaseAdmin.from('landlord_co_owners').delete().eq('co_owner_user_id', userId)
    }

    if (role === 'renter') {
      const { data: jobs } = await supabaseAdmin.from('jobs').select('id').eq('reported_by', userId)
      const jobIds = (jobs || []).map((j) => j.id)
      if (jobIds.length) {
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
      const { data: tenancies } = await supabaseAdmin.from('tenancies').select('id').eq('renter_user_id', userId)
      const tenancyIds = (tenancies || []).map((t) => t.id)
      if (tenancyIds.length) {
        await supabaseAdmin.from('rent_payments').delete().in('tenancy_id', tenancyIds)
        await supabaseAdmin.from('tenancy_occupants').delete().in('tenancy_id', tenancyIds)
      }
      await supabaseAdmin.from('tenancies').delete().eq('renter_user_id', userId)
      await supabaseAdmin.from('tenancy_occupants').delete().eq('renter_user_id', userId)
    }

    if (role === 'contractor') {
      await supabaseAdmin.from('job_questions').delete().eq('contractor_user_id', userId)
      await supabaseAdmin.from('contractor_reviews').delete().eq('contractor_user_id', userId)
      await supabaseAdmin.from('bids').delete().eq('contractor_user_id', userId)
      const { data: verifications } = await supabaseAdmin
        .from('contractor_verifications')
        .select('license_document_url, insurance_document_url')
        .eq('contractor_user_id', userId)
      const { data: credentials } = await supabaseAdmin.from('contractor_credentials').select('document_url').eq('contractor_user_id', userId)
      await removeStorageFiles('contractor-documents', [
        ...(verifications || []).flatMap((v) => [v.license_document_url, v.insurance_document_url]),
        ...(credentials || []).map((c) => c.document_url),
      ])
      await supabaseAdmin.from('contractor_verifications').delete().eq('contractor_user_id', userId)
      await supabaseAdmin.from('contractor_credentials').delete().eq('contractor_user_id', userId)
      const { data: contractorPhotos } = await supabaseAdmin.from('job_photos').select('photo_url').eq('uploaded_by', userId)
      await removeStorageFiles('job-photos', (contractorPhotos || []).map((p) => p.photo_url))
      await supabaseAdmin.from('job_photos').delete().eq('uploaded_by', userId)
    }

    // Common to every role
    const { data: threads } = await supabaseAdmin
      .from('dm_threads')
      .select('id')
      .or(`landlord_user_id.eq.${userId},other_user_id.eq.${userId}`)
    const threadIds = (threads || []).map((t) => t.id)
    if (threadIds.length) {
      await supabaseAdmin.from('messages').delete().in('thread_id', threadIds)
      await supabaseAdmin.from('dm_threads').delete().in('id', threadIds)
    }
    await supabaseAdmin.from('messages').delete().eq('sender_user_id', userId)
    await supabaseAdmin.from('message_read_state').delete().eq('user_id', userId)
    await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', userId)
    await supabaseAdmin.from('personal_emergency_contacts').delete().eq('user_id', userId)
    await supabaseAdmin.from('contractor_invites').delete().eq('landlord_user_id', userId)
    const { data: ownDocs } = await supabaseAdmin.from('documents').select('file_url').eq('uploaded_by', userId)
    await removeStorageFiles('documents', (ownDocs || []).map((d) => d.file_url))
    await supabaseAdmin.from('documents').delete().eq('uploaded_by', userId)
    await supabaseAdmin.from('contractor_reviews').delete().eq('reviewer_user_id', userId)
    await supabaseAdmin.from('disputes').update({ resolved_by: null }).eq('resolved_by', userId)
    await supabaseAdmin.from('disputes').delete().eq('raised_by_user_id', userId)
    await supabaseAdmin.from('custom_categories').update({ created_by: null }).eq('created_by', userId)

    const { error: usersDeleteError } = await supabaseAdmin.from('users').delete().eq('id', userId)
    if (usersDeleteError) {
      console.error('deleteAccountCascade: could not delete public.users row', { userId, usersDeleteError })
      return { ok: false, error: "Something is still linked to this account that wasn't expected.", status: 500 }
    }

    await logAdminAudit({
      actionType: 'account_deleted',
      actorEmail: audit.actorEmail,
      targetUserId: userId,
      targetEmail: audit.targetEmail,
      targetRole: role,
      detail: audit.detail,
    })

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (authDeleteError) {
      console.error('deleteAccountCascade: auth.admin.deleteUser failed', authDeleteError)
      return { ok: false, error: 'Data was deleted, but the account itself needs a manual follow-up.', status: 500 }
    }

    return { ok: true }
  } catch (err) {
    console.error('deleteAccountCascade: unhandled error', err)
    return { ok: false, error: 'Something went wrong during deletion.', status: 500 }
  }
}
