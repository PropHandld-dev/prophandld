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

  const { data: tenancy } = await supabaseAdmin
    .from('tenancies')
    .select('unit_id')
    .eq('renter_user_id', user.id)
    .eq('ended', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

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
