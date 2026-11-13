import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrgManagedOwnerIds, scopeOwnerIdsForMember, type PmMembership } from '@/lib/pm'
import { sendPmDailyDigestEmail } from '@/lib/email'
import { emailAllowed } from '@/lib/notificationPrefs'

export const maxDuration = 60

// One daily email per PM member who opted into digest mode instead of
// real-time (notifyLandlordIds already excludes them from every
// per-event notification -- this is the other half of that trade). Not
// an event-log replay; same two numbers the Overview tab's own cards
// already compute (pending approvals, compliance items due soon), just
// scoped to whatever that specific member can actually see.
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const { data: members, error } = await admin
    .from('pm_organization_members')
    .select('id, user_id, organization_id, member_role, scope_all_clients, pm_organizations(name)')
    .eq('status', 'accepted')
    .eq('notification_mode', 'digest')

  if (error) {
    console.error('cron/pm-notification-digest: could not load members', error)
    return NextResponse.json({ error: 'Could not load members' }, { status: 500 })
  }

  let sent = 0
  for (const m of (members || []) as any[]) {
    if (!m.user_id) continue
    try {
      const { data: userRow } = await admin.from('users').select('email, full_name, preferred_language, email_notifications_enabled').eq('id', m.user_id).maybeSingle()
      if (!userRow?.email || !emailAllowed(userRow)) continue

      const membership: PmMembership = {
        memberId: m.id,
        organizationId: m.organization_id,
        organizationName: m.pm_organizations?.name || 'your organization',
        memberRole: m.member_role,
        canViewFinancials: true,
        scopeAllClients: m.scope_all_clients,
        notificationMode: 'digest',
      }

      const orgOwnerIds = await getOrgManagedOwnerIds(admin, m.organization_id)
      const ownerIds = await scopeOwnerIdsForMember(admin, membership, orgOwnerIds)
      if (ownerIds.length === 0) continue

      const { data: properties } = await admin.from('properties').select('id').in('owner_user_id', ownerIds).eq('archived', false)
      const propertyIds = (properties || []).map((p: any) => p.id)

      let pendingApprovals = 0
      let complianceAlerts = 0
      if (propertyIds.length > 0) {
        const [{ data: jobs }, { data: compliance }] = await Promise.all([
          admin.from('jobs').select('id, units!inner(property_id)').in('units.property_id', propertyIds).eq('status', 'completed').is('landlord_approved_at', null),
          admin.from('compliance_items').select('expiry_date, reminder_days').in('property_id', propertyIds).not('expiry_date', 'is', null),
        ])
        pendingApprovals = (jobs || []).length
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        complianceAlerts = (compliance || []).filter((c: any) => {
          const daysUntil = Math.round((new Date(c.expiry_date + 'T00:00:00').getTime() - today.getTime()) / 86400000)
          return daysUntil <= (c.reminder_days ?? 30)
        }).length
      }

      if (pendingApprovals === 0 && complianceAlerts === 0) continue

      await sendPmDailyDigestEmail({
        to: userRow.email,
        memberName: userRow.full_name || 'there',
        orgName: m.pm_organizations?.name || 'your organization',
        pendingApprovals,
        complianceAlerts,
        dateLabel,
        lang: userRow.preferred_language === 'es' ? 'es' : 'en',
      })
      sent++
    } catch (err) {
      console.error('cron/pm-notification-digest: failed for member', m.id, err)
    }
  }

  return NextResponse.json({ sent })
}
