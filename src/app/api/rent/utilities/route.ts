import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { loadUtilityCharges } from '@/lib/utilityCharges'

export const maxDuration = 15

// GET ?tenancyId= : every utility bill on that tenancy's rent months.
// Access rides on rent_payments' own RLS: the months this user can already
// see (tenant, co-renter, owner, co-owner, their PM) are exactly the ones
// whose bills come back.
export async function GET(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const tenancyId = request.nextUrl.searchParams.get('tenancyId')
  if (!tenancyId || !/^[0-9a-f-]{36}$/i.test(tenancyId)) return NextResponse.json({ error: 'Missing tenancyId' }, { status: 400 })

  const { data: months, error } = await authClient.from('rent_payments').select('id').eq('tenancy_id', tenancyId)
  if (error) return NextResponse.json({ error: 'Could not load bills' }, { status: 500 })

  try {
    const charges = await loadUtilityCharges(getSupabaseAdmin(), (months || []).map((m) => m.id))
    return NextResponse.json({ charges })
  } catch (err) {
    console.error('rent/utilities: load failed', err)
    return NextResponse.json({ error: 'Could not load bills' }, { status: 500 })
  }
}
