import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAiAssistAccess } from '@/lib/aiAssist'

// Tells a renter's UI whether to show AI-powered features (lease Q&A, the
// smarter issue-report flow) at all — never exposes the landlord's billing
// status/price, just a plain yes/no the renter-side page can branch on.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.app_metadata?.role !== 'renter') {
    return NextResponse.json({ available: false })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // get_my_active_tenancy_id() is security-definer against auth.uid(), so
  // it runs on the caller's own session (authClient), not the service-role
  // one — but that's all it needs, and it's what correctly resolves a
  // co-renter (tenancy_occupants) to the same tenancy as the primary
  // tenant. Querying tenancies by renter_user_id directly, like this route
  // used to, only ever matched the primary tenant — a co-renter got
  // available: false regardless of whether their landlord actually has
  // Prophandld AI on.
  const { data: tenancyId } = await authClient.rpc('get_my_active_tenancy_id')
  const { data: tenancy } = tenancyId
    ? await supabaseAdmin.from('tenancies').select('unit_id').eq('id', tenancyId).maybeSingle()
    : { data: null }

  if (!tenancy) {
    return NextResponse.json({ available: false })
  }

  const { data: unit } = await supabaseAdmin
    .from('units')
    .select('properties(owner_user_id)')
    .eq('id', tenancy.unit_id)
    .maybeSingle()
  const landlordUserId = (unit as any)?.properties?.owner_user_id

  if (!landlordUserId) {
    return NextResponse.json({ available: false })
  }

  const available = await hasAiAssistAccess(supabaseAdmin, landlordUserId)
  return NextResponse.json({ available })
}
