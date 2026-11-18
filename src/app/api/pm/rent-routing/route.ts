import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership, logPmAction } from '@/lib/pm'
import { notifyUser } from '@/lib/notifyUser'

export const maxDuration = 20

const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '))

async function context() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  const admin = getSupabaseAdmin()
  return { user, admin }
}

// GET: the PM company's rent-collection readiness (admins and staff).
export async function GET() {
  const ctx = await context()
  if ('error' in ctx) return ctx.error
  const membership = await getPmMembership(ctx.admin, ctx.user.id)
  if (!membership) return NextResponse.json({ error: 'Not a PM member' }, { status: 403 })
  const { data: org } = await ctx.admin
    .from('pm_organizations')
    .select('broker_license_number, broker_license_state, trust_account_attested_at, admin_user_id')
    .eq('id', membership.organizationId)
    .maybeSingle()
  const { data: adminRow } = org?.admin_user_id
    ? await ctx.admin.from('users').select('stripe_connect_status').eq('id', org.admin_user_id).maybeSingle()
    : { data: null }
  return NextResponse.json({
    brokerLicenseNumber: org?.broker_license_number || '',
    brokerLicenseState: org?.broker_license_state || 'PA',
    attested: !!org?.trust_account_attested_at && !!org?.broker_license_number,
    payoutsReady: adminRow?.stripe_connect_status === 'active',
  })
}

// POST, one of:
//  { action: 'attest', brokerLicenseNumber, brokerLicenseState, trustAccount: true }  (PM admin)
//  { action: 'request' | 'stop', portfolioId }                                      (PM admin)
//  { action: 'approve' | 'decline' | 'revoke', portfolioId }                         (owner)
export async function POST(request: NextRequest) {
  const ctx = await context()
  if ('error' in ctx) return ctx.error
  const { user, admin } = ctx
  const body = (await request.json().catch(() => ({}))) as Record<string, any>
  const action = body.action as string

  if (action === 'attest') {
    const membership = await getPmMembership(admin, user.id)
    if (membership?.memberRole !== 'admin') return NextResponse.json({ error: 'Only a PM company admin can do this' }, { status: 403 })
    const license = typeof body.brokerLicenseNumber === 'string' ? body.brokerLicenseNumber.trim() : ''
    const state = typeof body.brokerLicenseState === 'string' ? body.brokerLicenseState.trim().toUpperCase() : ''
    if (license.length < 3 || license.length > 40) return NextResponse.json({ error: 'Enter your broker license number' }, { status: 400 })
    if (!US_STATES.has(state)) return NextResponse.json({ error: 'Choose the state that issued the license' }, { status: 400 })
    if (body.trustAccount !== true) return NextResponse.json({ error: 'Confirm you hold client rent in a trust or escrow account' }, { status: 400 })
    const { error } = await admin
      .from('pm_organizations')
      .update({ broker_license_number: license, broker_license_state: state, trust_account_attested_at: new Date().toISOString(), trust_account_attested_by: user.id })
      .eq('id', membership.organizationId)
    if (error) return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const portfolioId = typeof body.portfolioId === 'string' ? body.portfolioId : ''
  const { data: portfolio } = await admin
    .from('pm_client_portfolios')
    .select('id, organization_id, owner_user_id, status, rent_recipient, rent_to_pm_requested_at, rent_to_pm_approved_at, pm_organizations(name, admin_user_id, broker_license_number, broker_license_state, trust_account_attested_at)')
    .eq('id', portfolioId)
    .maybeSingle()
  if (!portfolio || portfolio.status !== 'accepted') return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  const org: any = (portfolio as any).pm_organizations
  const { data: owner } = await admin.from('users').select('full_name').eq('id', portfolio.owner_user_id).maybeSingle()
  const ownerName = owner?.full_name || 'Your client'

  if (action === 'request' || action === 'stop') {
    const membership = await getPmMembership(admin, user.id)
    if (membership?.memberRole !== 'admin' || membership.organizationId !== portfolio.organization_id) {
      return NextResponse.json({ error: 'Only a PM company admin can do this' }, { status: 403 })
    }
    if (action === 'request') {
      if (!org?.broker_license_number || !org?.trust_account_attested_at) {
        return NextResponse.json({ error: 'Add your broker license and trust account first', needsAttest: true }, { status: 400 })
      }
      const { data: adminRow } = await admin.from('users').select('stripe_connect_status').eq('id', org.admin_user_id).maybeSingle()
      if (adminRow?.stripe_connect_status !== 'active') {
        return NextResponse.json({ error: 'Set up payouts on your profile first, so rent has somewhere to go', needsPayouts: true }, { status: 400 })
      }
      if (portfolio.rent_recipient === 'pm') return NextResponse.json({ ok: true, already: true })
      await admin.from('pm_client_portfolios').update({ rent_to_pm_requested_at: new Date().toISOString(), rent_to_pm_requested_by: user.id, rent_to_pm_approved_at: null }).eq('id', portfolio.id)
      await notifyUser(admin, portfolio.owner_user_id, {
        title: `${org.name} asks to collect your rent`,
        body: 'Review and approve or decline. Rent keeps coming to you until you approve.',
        url: '/landlord/pm',
        critical: true,
        sms: `${org.name} asks to collect your rent. Review it in Prophandld.`,
        email: {
          subject: `${org.name} asks to collect rent for you`,
          eyebrow: 'Approval needed',
          heading: `${org.name} asks to collect your rent`,
          body: `If you approve, tenants' rent payments go to ${org.name}'s account, which they've confirmed is a trust/escrow account, and they pay you out under your agreement. Until you approve, rent keeps going straight to you. You can switch it back anytime.`,
          ctaLabel: 'Review',
          facts: [{ label: 'Broker license', value: `${org.broker_license_state || ''} ${org.broker_license_number}`.trim() }],
        },
      })
      await logPmAction(admin, { organizationId: portfolio.organization_id, ownerUserId: portfolio.owner_user_id, actorUserId: user.id, action: 'rent_routing_requested' }).catch(() => {})
      return NextResponse.json({ ok: true })
    }
    await admin.from('pm_client_portfolios').update({ rent_recipient: 'owner', rent_to_pm_requested_at: null, rent_to_pm_requested_by: null, rent_to_pm_approved_at: null }).eq('id', portfolio.id)
    await notifyUser(admin, portfolio.owner_user_id, {
      title: 'Rent now comes to you',
      body: `${org.name} stopped collecting your rent. New payments go straight to your account.`,
      url: '/landlord/pm',
      critical: true,
      email: { subject: 'Rent now goes straight to you', eyebrow: 'Rent', heading: 'Rent now comes to you', ctaLabel: 'Open Prophandld' },
    })
    await logPmAction(admin, { organizationId: portfolio.organization_id, ownerUserId: portfolio.owner_user_id, actorUserId: user.id, action: 'rent_routing_stopped' }).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  if (action === 'approve' || action === 'decline' || action === 'revoke') {
    if (portfolio.owner_user_id !== user.id) return NextResponse.json({ error: 'Only the owner can decide this' }, { status: 403 })
    if (action === 'approve') {
      if (!portfolio.rent_to_pm_requested_at) return NextResponse.json({ error: 'There is no request to approve' }, { status: 409 })
      if (!org?.broker_license_number || !org?.trust_account_attested_at) return NextResponse.json({ error: `${org?.name} hasn't confirmed their license and trust account` }, { status: 409 })
      await admin.from('pm_client_portfolios').update({ rent_recipient: 'pm', rent_to_pm_approved_at: new Date().toISOString() }).eq('id', portfolio.id)
    } else {
      await admin.from('pm_client_portfolios').update({ rent_recipient: 'owner', rent_to_pm_requested_at: null, rent_to_pm_requested_by: null, rent_to_pm_approved_at: null }).eq('id', portfolio.id)
    }
    const verb = action === 'approve' ? 'approved' : action === 'decline' ? 'declined' : 'switched rent back to themselves'
    await notifyUser(admin, org?.admin_user_id, {
      title: action === 'approve' ? `${ownerName} approved rent collection` : `${ownerName} ${verb}`,
      body: action === 'approve' ? `Rent for ${ownerName}'s properties now comes to your account.` : `Rent for ${ownerName}'s properties goes straight to them.`,
      url: '/landlord/pm',
      critical: true,
      sms: action === 'approve' ? `${ownerName} approved: you now collect their rent.` : `${ownerName}: rent now goes straight to them.`,
      email: {
        subject: action === 'approve' ? `${ownerName} approved rent collection` : `Rent collection: ${ownerName} ${verb}`,
        eyebrow: 'Rent collection',
        heading: action === 'approve' ? `You now collect ${ownerName}'s rent` : `${ownerName} ${verb}`,
        ctaLabel: 'Open Prophandld',
      },
    })
    await logPmAction(admin, { organizationId: portfolio.organization_id, ownerUserId: portfolio.owner_user_id, actorUserId: user.id, action: `rent_routing_${action}` }).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
