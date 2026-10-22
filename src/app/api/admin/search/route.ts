import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'

// Looks up a person by name/email/phone across all three roles in one
// box, instead of going into the Users tab and knowing which role-tab to
// search in first. public.users has name/email/phone kept in sync (see
// profile/page.tsx's save), so this queries it directly — fast, no need
// for the paginated auth.admin.listUsers() loop /api/admin/users uses.
// role only lives in Auth's app_metadata though, not public.users, so
// it's fetched per-match afterward — fine at this result count (capped
// at 10), the same reason /api/admin/users itself loads the full list
// instead of trying to filter in SQL.
export async function GET(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const q = request.nextUrl.searchParams.get('q')?.trim() || ''
  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const like = `%${q}%`
  const { data: rows, error } = await supabaseAdmin
    .from('users')
    .select('id, full_name, email, phone')
    .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
    .limit(10)

  if (error) {
    console.error('admin/search: query failed', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }

  const results = await Promise.all(
    (rows || []).map(async (row) => {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.id)
      return {
        id: row.id,
        name: row.full_name || row.email,
        email: row.email,
        phone: row.phone,
        role: authUser?.user?.app_metadata?.role || null,
      }
    })
  )

  return NextResponse.json({ results: results.filter((r) => r.role) })
}
