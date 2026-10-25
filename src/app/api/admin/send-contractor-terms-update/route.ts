import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { sendContractorTermsUpdatedEmail } from '@/lib/email'

// One-off broadcast for the 2026-10-24 contractor terms update (the
// "free ... ever" -> pilot-program wording change, see
// scripts/2026-10-24-contractor-terms-notice-column.sql). Claim-once via
// contractor_terms_pilot_notice_sent_at, same pattern as welcomed_at —
// safe to trigger more than once, only ever emails a given contractor one
// time. Admin-only, AAL2-gated, POST only (this has a real side effect).
export async function POST() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  try {
    const perPage = 1000
    let page = 1
    const contractors: any[] = []
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      contractors.push(...data.users.filter((u: any) => u.app_metadata?.role === 'contractor'))
      if (data.users.length < perPage) break
      page++
    }

    const ids = contractors.map((c) => c.id)
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('users')
      .select('id, full_name, preferred_language, contractor_terms_pilot_notice_sent_at')
      .in('id', ids)
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

    const profileById = new Map((profiles || []).map((p: any) => [p.id, p]))

    let sent = 0
    let alreadySent = 0
    let failed = 0
    const failures: string[] = []

    for (const c of contractors) {
      const profile: any = profileById.get(c.id)
      if (profile?.contractor_terms_pilot_notice_sent_at) {
        alreadySent++
        continue
      }
      try {
        await sendContractorTermsUpdatedEmail({
          to: c.email,
          contractorName: profile?.full_name || c.user_metadata?.full_name || 'there',
          lang: profile?.preferred_language === 'es' ? 'es' : 'en',
        })
        await supabaseAdmin
          .from('users')
          .update({ contractor_terms_pilot_notice_sent_at: new Date().toISOString() })
          .eq('id', c.id)
        sent++
      } catch (err) {
        failed++
        failures.push(`${c.email}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return NextResponse.json({ totalContractors: contractors.length, sent, alreadySent, failed, failures })
  } catch (err) {
    console.error('send-contractor-terms-update: unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
