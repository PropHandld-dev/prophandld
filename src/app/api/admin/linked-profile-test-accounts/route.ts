import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { deleteAccountCascade } from '@/lib/deleteAccount'

// Profile switching (lib/linkedProfiles.ts) is hidden behind a feature
// flag, not deleted — any account created through it before that (a
// linked_group_id that isn't its own id, i.e. a "secondary" profile, not
// the original account the group is anchored on) is now unreachable
// through the UI but still sitting in the database, as a real contractor/
// renter/landlord row with a synthetic "+role@" (or chained "+role+role@"
// for a profile created from an already-linked one) email. This surfaces
// those for review (GET) and deletes a specific one (POST) using the same
// cascade as self-service account deletion.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: rows, error } = await supabaseAdmin
    .from('users')
    .select('id, email, full_name, created_at, linked_group_id')
    .not('linked_group_id', 'is', null)

  if (error) {
    console.error('linked-profile-test-accounts: query failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const secondary = (rows || []).filter((r) => r.linked_group_id !== r.id)

  const accounts = await Promise.all(
    secondary.map(async (row) => {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.id)
      return {
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        role: authUser?.user?.app_metadata?.role || null,
        created_at: row.created_at,
        last_sign_in_at: authUser?.user?.last_sign_in_at || null,
      }
    })
  )

  return NextResponse.json({ accounts })
}

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { userId: targetUserId } = (await request.json()) as { userId?: string }
  if (!targetUserId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Re-verify this is actually a secondary linked profile right before
  // deleting — never trust a client-supplied id alone for something this
  // destructive. Refuses a primary/anchor account (linked_group_id === id)
  // or any account with no linked_group_id at all, i.e. a real account.
  const { data: targetRow } = await supabaseAdmin
    .from('users')
    .select('id, email, linked_group_id')
    .eq('id', targetUserId)
    .maybeSingle()
  if (!targetRow || !targetRow.linked_group_id || targetRow.linked_group_id === targetRow.id) {
    return NextResponse.json({ error: 'This is not a secondary linked-profile account — refusing to delete it here.' }, { status: 400 })
  }

  const { data: targetAuthUser } = await supabaseAdmin.auth.admin.getUserById(targetUserId)
  const role = targetAuthUser?.user?.app_metadata?.role

  const result = await deleteAccountCascade(supabaseAdmin, targetUserId, role, {
    actorEmail: user.email,
    targetEmail: targetRow.email,
    detail: { admin_cleanup: 'linked_profile_test_account', linked_group_id: targetRow.linked_group_id },
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
