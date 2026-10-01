import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripe } from '@/lib/stripe'
import { logAdminAudit } from '@/lib/auditLog'

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
          await supabaseAdmin.from('disputes').delete().in('job_id', jobIds)
          await supabaseAdmin.from('job_questions').delete().in('job_id', jobIds)
          await supabaseAdmin.from('contractor_reviews').delete().in('job_id', jobIds)
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

          // appliance_service_log references maintenance_items.id (not
          // unit_id directly — confirmed against the systems page, which
          // deletes a log by appliance_id before deleting the item itself,
          // same ordering requirement), so the log has to go first or the
          // maintenance_items delete right after this hits a foreign-key
          // violation for any unit with a service history.
          const { data: maintenanceItems } = await supabaseAdmin.from('maintenance_items').select('id').in('unit_id', unitIds)
          const maintenanceItemIds = (maintenanceItems || []).map((m) => m.id)
          if (maintenanceItemIds.length) {
            await supabaseAdmin.from('appliance_service_log').delete().in('appliance_id', maintenanceItemIds)
          }
          await supabaseAdmin.from('maintenance_items').delete().in('unit_id', unitIds)

          // Same shape: inspection_photos references move_in_inspections.id,
          // and move_in_inspections itself references unit_id — both have
          // to clear before the units delete further down, or any unit
          // with a move-in/move-out inspection on file blocks the whole
          // deletion with a raw constraint-violation error.
          const { data: inspections } = await supabaseAdmin.from('move_in_inspections').select('id').in('unit_id', unitIds)
          const inspectionIds = (inspections || []).map((i) => i.id)
          if (inspectionIds.length) {
            await supabaseAdmin.from('inspection_photos').delete().in('inspection_id', inspectionIds)
          }
          await supabaseAdmin.from('move_in_inspections').delete().in('unit_id', unitIds)
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
      // Cancel the real Stripe subscription before dropping our own record
      // of it — deleting only the local row would leave it billing forever
      // with nothing left anywhere that shows it exists.
      const { data: subscription } = await supabaseAdmin
        .from('landlord_subscriptions')
        .select('stripe_subscription_id')
        .eq('landlord_user_id', userId)
        .maybeSingle()
      if (subscription?.stripe_subscription_id) {
        try {
          await getStripe().subscriptions.cancel(subscription.stripe_subscription_id)
        } catch (err) {
          // Already canceled, or Stripe hiccuped — don't let that block the
          // rest of account deletion; log it so it can be checked by hand.
          console.error('account delete: could not cancel Stripe subscription', { userId, err })
        }
      }
      await supabaseAdmin.from('landlord_subscriptions').delete().eq('landlord_user_id', userId)
    }

    if (role === 'renter') {
      const { data: jobs } = await supabaseAdmin.from('jobs').select('id').eq('reported_by', userId)
      const jobIds = (jobs || []).map((j) => j.id)
      if (jobIds.length) {
        await supabaseAdmin.from('disputes').delete().in('job_id', jobIds)
        await supabaseAdmin.from('job_questions').delete().in('job_id', jobIds)
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
        await supabaseAdmin.from('tenancy_occupants').delete().in('tenancy_id', tenancyIds)
      }
      await supabaseAdmin.from('tenancies').delete().eq('renter_user_id', userId)
      // Covers a co-occupant added to someone else's tenancy, not just a
      // primary tenant's own — that row references this account's id too
      // and isn't reached by the tenancy_id cleanup above, which only
      // covers tenancies this account is the primary renter on.
      await supabaseAdmin.from('tenancy_occupants').delete().eq('renter_user_id', userId)
    }

    if (role === 'contractor') {
      await supabaseAdmin.from('job_questions').delete().eq('contractor_user_id', userId)
      await supabaseAdmin.from('contractor_reviews').delete().eq('contractor_user_id', userId)
      await supabaseAdmin.from('bids').delete().eq('contractor_user_id', userId)
      await supabaseAdmin.from('contractor_verifications').delete().eq('contractor_user_id', userId)
      await supabaseAdmin.from('contractor_credentials').delete().eq('contractor_user_id', userId)
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
    // Only a landlord ever writes this (see invite-contractor/route.ts),
    // but deleting by landlord_user_id here is a harmless no-op for every
    // other role rather than something that needs its own role branch —
    // and it has to happen somewhere, since a landlord with a pending
    // contractor invite otherwise hit the same unreached-reference problem
    // as the two tables just above.
    await supabaseAdmin.from('contractor_invites').delete().eq('landlord_user_id', userId)
    // Two columns the per-role blocks above don't reach: a renter's own
    // document-vault upload (not tied to any job, so the job cascade above
    // never sees it) and a review any role can leave on a contractor (not
    // just the contractor's own id, already handled above). Left alone,
    // either leaves this account referenced by a row that still exists
    // after the rest of this cleanup, which fails the public.users delete
    // below the same way the comment there already warns about.
    await supabaseAdmin.from('documents').delete().eq('uploaded_by', userId)
    await supabaseAdmin.from('contractor_reviews').delete().eq('reviewer_user_id', userId)
    // Preserve the dispute itself (and whoever else's audit trail this
    // resolution is part of) — only detach this account's own reference to
    // it, the same pattern already used for custom_categories.created_by.
    await supabaseAdmin.from('disputes').update({ resolved_by: null }).eq('resolved_by', userId)
    await supabaseAdmin.from('disputes').delete().eq('raised_by_user_id', userId)
    await supabaseAdmin.from('custom_categories').update({ created_by: null }).eq('created_by', userId)

    // This is the row a re-signup with the same email would otherwise
    // collide with if it's left behind — every table that can reference
    // this id must be cleared above before this delete is even attempted,
    // and its result actually has to be checked. A foreign-key violation
    // here used to be silently discarded, the route would still go on to
    // delete the auth account and report success, and the orphaned
    // public.users row (still holding its old welcomed_at, among other
    // stale state) would sit there ready to collide with whatever the
    // signup trigger does next time this email signs up again.
    const { error: usersDeleteError } = await supabaseAdmin.from('users').delete().eq('id', userId)
    if (usersDeleteError) {
      console.error('account delete: could not delete public.users row', { userId, usersDeleteError })
      // A foreign-key-violation message names real table/constraint
      // internals — meaningful for debugging, not for the person who just
      // clicked "Delete account" and has no way to act on it. Full detail
      // stays in the server log above either way.
      return NextResponse.json(
        { error: "Something is still linked to this account that we didn't expect. Contact admin@prophandld.com and we'll clear it manually." },
        { status: 500 }
      )
    }

    // Captured before the row (and the auth account right after) is gone
    // for good — this is the one record that survives a deletion, and
    // deliberately holds only enough to answer "did this account exist and
    // when did it leave", not a copy of anything the deletion was for.
    await logAdminAudit({
      actionType: 'account_deleted',
      actorEmail: user.email,
      targetUserId: userId,
      targetEmail: user.email,
      targetRole: role,
      detail: { self_deleted: true },
    })

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (authDeleteError) {
      // public.users is already gone at this point (checked above), so a
      // retry would hit "user not found" on that row even though the auth
      // account survived — worth knowing if this ever actually fires, but
      // not something to show raw to the person who clicked the button.
      console.error('account delete: auth.admin.deleteUser failed', authDeleteError)
      return NextResponse.json(
        { error: 'Your data was deleted, but the account itself needs a manual follow-up. Contact admin@prophandld.com.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('account delete: unhandled error', err)
    return NextResponse.json(
      { error: "Something went wrong deleting your account. Nothing was lost — contact admin@prophandld.com and we'll sort it out." },
      { status: 500 }
    )
  }
}
