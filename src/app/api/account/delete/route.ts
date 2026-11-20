import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { deleteAccountCascade } from '@/lib/deleteAccount'

// Self-service account deletion. The actual cascade (delete what the
// account itself owns, in FK-safe order, then the auth user) lives in
// lib/deleteAccount.ts — shared with the admin-driven cleanup route for a
// leftover linked-profile test account, so there's exactly one copy of
// this logic to keep correct.
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Unfinished paid work blocks deletion, with a reason: a contractor with
  // an accepted job not yet paid, or a landlord with work underway or a
  // contractor still owed money. Used to delete straight through.
  const ACTIVE = ['bid_selected', 'scheduled', 'in_progress', 'pending_review', 'disputed', 'completed']
  const role = user.app_metadata?.role
  if (role === 'contractor') {
    const { data: open } = await supabaseAdmin
      .from('bids')
      .select('id, jobs!inner(status)')
      .eq('contractor_user_id', user.id)
      .eq('status', 'accepted')
      .neq('payment_status', 'paid')
      .in('jobs.status', ACTIVE)
    if ((open || []).length > 0) {
      return NextResponse.json({ error: `You have ${open!.length} accepted job${open!.length === 1 ? '' : 's'} not yet finished or paid. Finish, cancel, or get paid for ${open!.length === 1 ? 'it' : 'them'} before deleting your account.` }, { status: 409 })
    }
  } else if (role === 'landlord') {
    const { data: open } = await supabaseAdmin
      .from('bids')
      .select('id, jobs!inner(status, units!inner(properties!inner(owner_user_id)))')
      .eq('jobs.units.properties.owner_user_id', user.id)
      .eq('status', 'accepted')
      .neq('payment_status', 'paid')
      .in('jobs.status', ACTIVE)
    if ((open || []).length > 0) {
      return NextResponse.json({ error: `You have ${open!.length} job${open!.length === 1 ? '' : 's'} with a contractor underway or still owed payment. Finish and pay, or cancel ${open!.length === 1 ? 'it' : 'them'}, before deleting your account.` }, { status: 409 })
    }
  }

  const result = await deleteAccountCascade(supabaseAdmin, user.id, user.app_metadata?.role, {
    actorEmail: user.email,
    targetEmail: user.email,
    detail: { self_deleted: true },
  })

  if (!result.ok) {
    // A foreign-key-violation message names real table/constraint
    // internals — meaningful for debugging, not for the person who just
    // clicked "Delete account" and has no way to act on it. Full detail
    // stays in the server log inside deleteAccountCascade either way.
    return NextResponse.json(
      { error: `${result.error} Contact admin@prophandld.com and we'll clear it manually.` },
      { status: result.status }
    )
  }

  return NextResponse.json({ ok: true })
}
