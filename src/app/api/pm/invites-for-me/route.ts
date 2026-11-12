import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const maxDuration = 15

// Powers a banner on an ordinary landlord's dashboard: is a PM org
// managing (or asking to manage) their property? Mirrors /api/co-owner/list's
// "iAmCoOwnerOf" shape — same idea, PM side.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const { data: rows } = await admin
    .from('pm_client_portfolios')
    .select('id, status, invited_at, accepted_at, approval_threshold, management_fee, management_fee_frequency, owner_read_only, pm_organizations(name)')
    .eq('owner_user_id', user.id)
    .order('invited_at', { ascending: false })

  return NextResponse.json({
    managedBy: (rows || []).map((r: any) => ({
      id: r.id,
      status: r.status,
      invitedAt: r.invited_at,
      acceptedAt: r.accepted_at,
      approvalThreshold: Number(r.approval_threshold),
      managementFee: r.management_fee !== null ? Number(r.management_fee) : null,
      managementFeeFrequency: r.management_fee_frequency,
      ownerReadOnly: !!r.owner_read_only,
      orgName: r.pm_organizations?.name || 'A property manager',
    })),
  })
}
