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
    .select('id, status, requested_by, invited_at, accepted_at, approval_threshold, management_fee, management_fee_frequency, management_fee_type, management_fee_percent, fee_owner_approved_at, owner_read_only, rent_recipient, rent_to_pm_requested_at, rent_to_pm_approved_at, pm_organizations(name, broker_license_number, broker_license_state, trust_account_attested_at)')
    .eq('owner_user_id', user.id)
    .order('invited_at', { ascending: false })

  return NextResponse.json({
    managedBy: (rows || []).map((r: any) => ({
      id: r.id,
      status: r.status,
      requestedBy: r.requested_by as 'pm' | 'owner',
      invitedAt: r.invited_at,
      acceptedAt: r.accepted_at,
      approvalThreshold: Number(r.approval_threshold),
      managementFee: r.management_fee !== null ? Number(r.management_fee) : null,
      managementFeeFrequency: r.management_fee_frequency,
      managementFeeType: (r.management_fee_type as 'flat' | 'percent_of_rent') || 'flat',
      managementFeePercent: r.management_fee_percent !== null ? Number(r.management_fee_percent) : null,
      feeApproved: !!r.fee_owner_approved_at,
      ownerReadOnly: !!r.owner_read_only,
      orgName: r.pm_organizations?.name || 'A property manager',
      rentRecipient: (r.rent_recipient as 'owner' | 'pm') || 'owner',
      rentToPmRequested: !!r.rent_to_pm_requested_at && !r.rent_to_pm_approved_at,
      brokerLicense: r.pm_organizations?.broker_license_number
        ? `${r.pm_organizations.broker_license_state ? `${r.pm_organizations.broker_license_state} ` : ''}${r.pm_organizations.broker_license_number}`
        : null,
      trustAccountAttested: !!r.pm_organizations?.trust_account_attested_at,
    })),
  })
}
