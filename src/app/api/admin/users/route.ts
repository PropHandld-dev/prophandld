import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// public.users has no `role` column — role only ever lived in Supabase
// Auth's user_metadata (set at signup, read everywhere else in the app
// as user.user_metadata?.role). Listing users with their role therefore
// has to go through the Auth Admin API (service-role only, so this
// can't be a plain client-side query like the rest of /admin/*).
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !user.email?.endsWith('@prophandld.com')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  try {
    // listUsers only ever returns one page (1000 rows here) — past that it
    // silently omits the rest with no error, same class of bug as the
    // portfolio-query truncation found and fixed elsewhere in the app.
    // Looping pages until one comes back short keeps this admin list
    // accurate regardless of how many accounts exist.
    const perPage = 1000
    let page = 1
    const allUsers: any[] = []
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
      if (error) {
        console.error('admin/users: error listing users', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      allUsers.push(...(data.users as any))
      if (data.users.length < perPage) break
      page++
    }

    const users = allUsers.map((u: any) => ({
      id: u.id,
      email: u.email,
      full_name: u.user_metadata?.full_name || null,
      role: u.user_metadata?.role || null,
      created_at: u.created_at,
    }))

    return NextResponse.json({ users })
  } catch (err) {
    console.error('admin/users: unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
