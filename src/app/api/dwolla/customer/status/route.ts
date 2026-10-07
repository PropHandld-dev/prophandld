import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 20

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: userRow, error: userRowError } = await supabaseAdmin
    .from('users')
    .select('dwolla_customer_id, dwolla_customer_type, dwolla_customer_status, dwolla_funding_source_status')
    .eq('id', user.id)
    .maybeSingle()

  if (userRowError) {
    console.error('dwolla/customer/status: error fetching user row', userRowError)
    return NextResponse.json({ error: 'Could not load bank account status' }, { status: 500 })
  }

  return NextResponse.json({
    customerStatus: userRow?.dwolla_customer_status || 'not_started',
    fundingSourceStatus: userRow?.dwolla_funding_source_status || 'none',
  })
}
