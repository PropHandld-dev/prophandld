import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { fetchAllPages } from '@/lib/pagedQuery'

// Reads back what logAdminAudit writes. Deliberately returns the email/
// role stored directly on each row, not a live join against users — the
// whole point of account_deleted entries is that the account (and its
// row) is gone by the time anyone reads this back.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // Paginated (not .limit(500)) -- an audit log specifically shouldn't have
  // entries silently become permanently unreachable through the UI once
  // more than 500 accumulate, with no "load more" and no sign anything
  // was cut off.
  const { data, error } = await fetchAllPages<any>((from, to) =>
    getSupabaseAdmin()
      .from('admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to)
  )

  if (error) {
    console.error('admin/audit-log: error loading', error)
    return NextResponse.json({ error: 'Could not load audit log' }, { status: 500 })
  }

  return NextResponse.json({ entries: data || [] })
}
