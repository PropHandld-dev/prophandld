import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { graduatedMonthlyAmount } from '@/lib/pricingTiers'
import { fetchAllPagesOrEmpty } from '@/lib/pagedQuery'

// public.users has no `role` column — role lives in Supabase Auth's
// app_metadata (service-role-only writable, set once at signup via
// /api/auth/set-role; see adminAccess.ts). Listing users with their
// role therefore has to go through the Auth Admin API, same reason
// this can't be a plain client-side query like the rest of /admin/*.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
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

    const ids = allUsers.map((u) => u.id)

    // One batched round-trip per role-specific table, instead of a query
    // per user — this list is meant to stay usable as the account count
    // grows, not just work fine in testing with a handful of rows.
    const [
      { data: profileRows },
      subs,
      properties,
      { data: tenancies },
      { data: verifications },
    ] = await Promise.all([
      supabaseAdmin.from('users').select('id, service_categories, service_zip, licensed').in('id', ids),
      // One row per landlord/property ever — won't truncate until either
      // count crosses 1000, but the same unbounded-select bug this
      // project built fetchAllPages specifically to stop.
      fetchAllPagesOrEmpty<any>((from, to) =>
        supabaseAdmin.from('landlord_subscriptions').select('landlord_user_id, tier, unit_count, status').range(from, to)
      ),
      fetchAllPagesOrEmpty<any>((from, to) =>
        supabaseAdmin.from('properties').select('owner_user_id').range(from, to)
      ),
      supabaseAdmin
        .from('tenancies')
        .select('renter_user_id, rent_amount, units(unit_number, properties(address, city, state, owner_user_id))')
        .eq('ended', false),
      supabaseAdmin.from('contractor_verifications').select('contractor_user_id, status'),
    ])

    const profileById = new Map((profileRows || []).map((p: any) => [p.id, p]))
    const subByLandlord = new Map((subs || []).map((s: any) => [s.landlord_user_id, s]))
    const propertyCountByOwner: Record<string, number> = {}
    ;(properties || []).forEach((p: any) => {
      propertyCountByOwner[p.owner_user_id] = (propertyCountByOwner[p.owner_user_id] || 0) + 1
    })
    const tenancyByRenter = new Map((tenancies || []).map((t: any) => [t.renter_user_id, t]))
    const verificationByContractor = new Map((verifications || []).map((v: any) => [v.contractor_user_id, v.status]))
    const nameById = new Map(allUsers.map((u) => [u.id, u.user_metadata?.full_name || u.email]))

    const users = allUsers.map((u: any) => {
      const role = u.app_metadata?.role || null
      const base = {
        id: u.id,
        email: u.email,
        full_name: u.user_metadata?.full_name || null,
        role,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
      }

      if (role === 'landlord') {
        const sub: any = subByLandlord.get(u.id)
        return {
          ...base,
          tier: sub?.tier || 'free',
          propertyCount: propertyCountByOwner[u.id] || 0,
          mrr: sub && sub.status === 'active' ? graduatedMonthlyAmount(sub.unit_count || 0) : 0,
        }
      }

      if (role === 'renter') {
        const t: any = tenancyByRenter.get(u.id)
        const unit = t?.units
        const property = unit?.properties
        return {
          ...base,
          hasActiveTenancy: !!t,
          rentAmount: t?.rent_amount ?? null,
          unitLabel: unit?.unit_number || null,
          propertyAddress: property ? `${property.address}, ${property.city}, ${property.state}` : null,
          landlordName: property?.owner_user_id ? nameById.get(property.owner_user_id) || null : null,
        }
      }

      if (role === 'contractor') {
        const profile: any = profileById.get(u.id)
        return {
          ...base,
          verificationStatus: verificationByContractor.get(u.id) || 'none',
          serviceCategories: profile?.service_categories || [],
          serviceZip: profile?.service_zip || null,
        }
      }

      return base
    })

    return NextResponse.json({ users })
  } catch (err) {
    console.error('admin/users: unhandled error', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
