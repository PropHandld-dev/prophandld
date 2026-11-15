import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'

// Moved server-side to close a real inconsistency: every other admin page
// reads through a route gated by requireAdminAal2 (MFA-aware), but this
// one queried Supabase directly from the client, backed only by
// disputes' own RLS policy ("Admins can read disputes" -- which checks
// admin membership but not the MFA/AAL2 step the rest of the admin area
// requires) plus a non-AAL2-aware /api/admin/check-access call. The
// mutation path (/api/disputes/resolve) already correctly required
// requireAdminAal2, so this was only ever a gap on the read side -- still
// worth closing so every admin page enforces the same bar consistently.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('disputes')
    .select('*, jobs(category, units(properties(address, city))), raiser:raised_by_user_id(full_name), resolver:resolved_by(full_name)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('admin/disputes: error loading', error)
    return NextResponse.json({ error: 'Could not load disputes' }, { status: 500 })
  }

  return NextResponse.json({ disputes: data || [] })
}
