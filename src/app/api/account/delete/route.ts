import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// Self-service account deletion. Cascades follow the same per-role
// pattern used for the manual test-account cleanups run against this
// schema (delete what the account itself owns, in FK-safe order) rather
// than a soft-delete/anonymize model — consistent with how this app's
// data has been treated everywhere else so far.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const userId = user.id
  const role = user.user_metadata?.role
  const supabaseAdmin = getSupabaseAdmin()

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
        await supabaseAdmin.from('documents').delete().in('property_id', propertyIds)
        await supabaseAdmin.from('compliance_items').delete().in('property_id', propertyIds)
        await supabaseAdmin.from('contacts').delete().in('property_id', propertyIds)
        await supabaseAdmin.from('property_roles').delete().in('property_id', propertyIds)
        if (unitIds.length) {
          await supabaseAdmin.from('units').delete().in('property_id', propertyIds)
        }
        await supabaseAdmin.from('properties').delete().in('id', propertyIds)
      }
      await supabaseAdmin.from('landlord_subscriptions').delete().eq('landlord_user_id', userId)
    }

    if (role === 'renter') {
      const { data: jobs } = await supabaseAdmin.from('jobs').select('id').eq('reported_by', userId)
      const jobIds = (jobs || []).map((j) => j.id)
      if (jobIds.length) {
        await supabaseAdmin.from('contractor_reviews').delete().in('job_id', jobIds)
        await supabaseAdmin.from('job_photos').delete().in('job_id', jobIds)
        await supabaseAdmin.from('bids').delete().in('job_id', jobIds)
        await supabaseAdmin.from('messages').delete().in('job_id', jobIds)
        await supabaseAdmin.from('jobs').delete().in('id', jobIds)
      }
      const { data: tenancies } = await supabaseAdmin.from('tenancies').select('id').eq('renter_user_id', userId)
      const tenancyIds = (tenancies || []).map((t) => t.id)
      if (tenancyIds.length) {
        await supabaseAdmin.from('rent_payments').delete().in('tenancy_id', tenancyIds)
      }
      await supabaseAdmin.from('tenancies').delete().eq('renter_user_id', userId)
    }

    if (role === 'contractor') {
      await supabaseAdmin.from('contractor_reviews').delete().eq('contractor_user_id', userId)
      await supabaseAdmin.from('bids').delete().eq('contractor_user_id', userId)
      await supabaseAdmin.from('contractor_verifications').delete().eq('contractor_user_id', userId)
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
    await supabaseAdmin.from('custom_categories').update({ created_by: null }).eq('created_by', userId)
    await supabaseAdmin.from('users').delete().eq('id', userId)

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (authDeleteError) {
      console.error('account delete: auth.admin.deleteUser failed', authDeleteError)
      return NextResponse.json({ error: authDeleteError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('account delete: unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
