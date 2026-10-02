import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { requirementsFor } from '@/lib/credentialRequirements'
import { computeServiceArea } from '@/lib/contractorServiceArea'

// Answers "who's missing what", which nothing else in the app does — the
// credential-expiry cron only ever counts down a requirement that was
// already submitted (it has nothing to count down for one that never
// was). Built for the admin roster: every contractor, their actual
// required credentials given their real service area and trades, and
// which of those are missing, pending, verified or expired.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const admin = getSupabaseAdmin()

  const perPage = 1000
  let page = 1
  const allUsers: any[] = []
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.error('contractor-compliance: error listing users', error)
      return NextResponse.json({ error: 'Could not list users' }, { status: 500 })
    }
    allUsers.push(...data.users)
    if (data.users.length < perPage) break
    page++
  }
  const contractorIds = allUsers.filter((u) => u.user_metadata?.role === 'contractor').map((u) => u.id)
  if (contractorIds.length === 0) {
    return NextResponse.json({ contractors: [] })
  }

  const [{ data: profiles, error: profilesError }, { data: creds, error: credsError }] = await Promise.all([
    admin
      .from('users')
      .select('id, full_name, email, service_categories, service_zip, service_radius_miles, preferred_language')
      .in('id', contractorIds),
    admin.from('contractor_credentials').select('contractor_user_id, requirement_id, status, expiry').in('contractor_user_id', contractorIds),
  ])

  if (profilesError) {
    console.error('contractor-compliance: profiles query failed', profilesError)
    return NextResponse.json({ error: 'Could not load contractor profiles' }, { status: 500 })
  }
  if (credsError) {
    console.error('contractor-compliance: credentials query failed', credsError)
    return NextResponse.json({ error: 'Could not load credentials' }, { status: 500 })
  }

  const credsByContractor = new Map<string, { requirement_id: string; status: string; expiry: string | null }[]>()
  for (const c of creds || []) {
    const list = credsByContractor.get(c.contractor_user_id) || []
    list.push(c)
    credsByContractor.set(c.contractor_user_id, list)
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const contractors = (profiles || []).map((p) => {
    const categories: string[] = p.service_categories || []
    const { states, cities } = computeServiceArea(p.service_zip, p.service_radius_miles)
    const hasServiceProfile = Boolean(p.service_zip && categories.length > 0)
    type CredStatus = 'missing' | 'pending' | 'verified' | 'rejected' | 'expired'
    const requirements = hasServiceProfile ? requirementsFor({ states, cities, categories }).requirements : []
    const theirCreds = credsByContractor.get(p.id) || []

    const items: { id: string; name: string; level: string; badge: string; regions: string[]; status: CredStatus; daysLeft: number | null }[] =
      requirements.map((req) => {
        const match = theirCreds.find((c) => c.requirement_id === req.id)
        let daysLeft: number | null = null
        let status: CredStatus = 'missing'
        if (match) {
          if (match.expiry) daysLeft = Math.round((new Date(match.expiry + 'T00:00:00').getTime() - today.getTime()) / 86400000)
          status = match.status === 'verified' && daysLeft !== null && daysLeft < 0 ? 'expired' : (match.status as CredStatus)
        }
        return { id: req.id, name: req.name, level: req.level, badge: req.badge, regions: req.regions, status, daysLeft }
      })

    const requiredItems = items.filter((i) => i.level === 'required')
    const missing = requiredItems.filter((i) => i.status === 'missing')
    const expired = requiredItems.filter((i) => i.status === 'expired')
    const pending = requiredItems.filter((i) => i.status === 'pending')
    const verified = requiredItems.filter((i) => i.status === 'verified')

    return {
      id: p.id,
      name: p.full_name || 'Unknown contractor',
      email: p.email,
      preferredLanguage: p.preferred_language || 'en',
      zip: p.service_zip || null,
      states,
      categories,
      hasServiceProfile,
      items,
      missingCount: missing.length,
      expiredCount: expired.length,
      pendingCount: pending.length,
      verifiedCount: verified.length,
      requiredCount: requiredItems.length,
      needsAttention: missing.length > 0 || expired.length > 0,
    }
  })

  contractors.sort((a, b) => (b.missingCount + b.expiredCount) - (a.missingCount + a.expiredCount))

  return NextResponse.json({ contractors })
}
