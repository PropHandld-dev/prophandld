import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership, logPmAction } from '@/lib/pm'
import { notifyRenterIds } from '@/lib/coRenters'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'
import { sendPmRelationshipEndedEmail, sendManagerChangedTenantEmail } from '@/lib/email'

export const maxDuration = 30

const ACTIVE_JOB_STATUSES = ['pending_approval', 'bidding', 'approved', 'bid_selected', 'scheduled', 'in_progress', 'pending_review']
const REASONS = ['switching_managers', 'self_managing', 'selling', 'service', 'pricing', 'other'] as const

type Admin = ReturnType<typeof getSupabaseAdmin>

// The owner of the relationship, or an admin of the PM company, may end it.
async function loadContext(portfolioId: string) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const admin = getSupabaseAdmin()
  const { data: portfolio } = await admin
    .from('pm_client_portfolios')
    .select('id, organization_id, owner_user_id, status, accepted_at, rent_recipient, pm_organizations(name, admin_user_id)')
    .eq('id', portfolioId)
    .maybeSingle()
  if (!portfolio) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }

  let side: 'owner' | 'pm' | null = null
  if (portfolio.owner_user_id === user.id) side = 'owner'
  else {
    const membership = await getPmMembership(admin, user.id)
    if (membership?.memberRole === 'admin' && membership.organizationId === portfolio.organization_id) side = 'pm'
  }
  if (!side) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { user, admin, portfolio: portfolio as any, side }
}

async function outstanding(admin: Admin, portfolio: any) {
  const ownerId = portfolio.owner_user_id as string | null
  if (!ownerId) return { openJobs: [], tenancies: [], unpaidFees: 0 }
  const { data: properties } = await admin.from('properties').select('id, address').eq('owner_user_id', ownerId).eq('archived', false)
  const propertyIds = (properties || []).map((p) => p.id)
  const addressById = new Map((properties || []).map((p) => [p.id, p.address]))
  const { data: units } = propertyIds.length
    ? await admin.from('units').select('id, unit_number, property_id').in('property_id', propertyIds)
    : { data: [] as any[] }
  const unitIds = (units || []).map((u: any) => u.id)
  const unitById = new Map((units || []).map((u: any) => [u.id, u]))
  const [{ data: jobs }, { data: tenancies }, { data: fees }] = await Promise.all([
    unitIds.length
      ? admin.from('jobs').select('id, category, status, unit_id').in('unit_id', unitIds).in('status', ACTIVE_JOB_STATUSES).limit(50)
      : Promise.resolve({ data: [] as any[] }),
    unitIds.length
      ? admin.from('tenancies').select('id, renter_user_id, unit_id').in('unit_id', unitIds).eq('ended', false).not('renter_user_id', 'is', null)
      : Promise.resolve({ data: [] as any[] }),
    admin.from('pm_fee_payments').select('amount, status').eq('portfolio_id', portfolio.id).in('status', ['pending', 'failed']),
  ])
  const unpaidFees = Math.round((fees || []).reduce((t: number, f: any) => t + Number(f.amount || 0), 0) * 100) / 100
  const addressOf = (unitId: string) => {
    const u: any = unitById.get(unitId)
    return u ? `${addressById.get(u.property_id) || ''}${u.unit_number && u.unit_number !== 'Main' ? `, Unit ${u.unit_number}` : ''}` : ''
  }
  return {
    openJobs: (jobs || []).map((j: any) => ({ id: j.id, category: j.category, status: j.status, address: addressOf(j.unit_id) })),
    tenancies: (tenancies || []).map((t: any) => ({ id: t.id, renterUserId: t.renter_user_id, address: addressOf(t.unit_id) })),
    unpaidFees,
  }
}

// GET: what ending this relationship would affect, for the confirm screen.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params
  const ctx = await loadContext(portfolioId)
  if ('error' in ctx) return ctx.error
  const { admin, portfolio, side } = ctx
  const o = await outstanding(admin, portfolio)
  const { data: owner } = portfolio.owner_user_id
    ? await admin.from('users').select('full_name').eq('id', portfolio.owner_user_id).maybeSingle()
    : { data: null }
  return NextResponse.json({
    side,
    status: portfolio.status,
    orgName: portfolio.pm_organizations?.name || 'your property manager',
    ownerName: owner?.full_name || portfolio.invited_email || 'the owner',
    managedSince: portfolio.accepted_at,
    rentToPm: portfolio.rent_recipient === 'pm',
    openJobs: o.openJobs.slice(0, 8),
    openJobsCount: o.openJobs.length,
    tenantCount: new Set(o.tenancies.map((t) => t.id)).size,
    unpaidFees: o.unpaidFees,
  })
}

// POST { reason?, note?, depositsHeld?, notifyTenants? }: ends it now.
export async function POST(request: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params
  const ctx = await loadContext(portfolioId)
  if ('error' in ctx) return ctx.error
  const { user, admin, portfolio, side } = ctx

  const body = (await request.json().catch(() => ({}))) as { reason?: string; note?: string; depositsHeld?: string; notifyTenants?: boolean }
  const reason = REASONS.includes(body.reason as any) ? body.reason! : null
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null
  const depositsHeld = ['yes', 'no', 'unsure'].includes(body.depositsHeld || '') ? (body.depositsHeld as 'yes' | 'no' | 'unsure') : null
  const notifyTenants = body.notifyTenants === true

  // A pending invite or request just goes away; nothing was ever managed.
  if (portfolio.status !== 'accepted') {
    await admin.from('pm_client_portfolios').delete().eq('id', portfolio.id)
    return NextResponse.json({ ok: true, wasPending: true })
  }

  const o = await outstanding(admin, portfolio)
  const orgName: string = portfolio.pm_organizations?.name || 'Your property manager'

  const { error: logError } = await admin.from('pm_relationship_endings').insert({
    organization_id: portfolio.organization_id,
    owner_user_id: portfolio.owner_user_id,
    ended_by: user.id,
    ended_by_side: side,
    reason,
    note,
    deposits_held: depositsHeld,
    notified_tenants: notifyTenants && o.tenancies.length > 0,
    open_jobs_count: o.openJobs.length,
    unpaid_fees_amount: o.unpaidFees,
    rent_was_to_pm: portfolio.rent_recipient === 'pm',
    managed_since: portfolio.accepted_at,
  })
  if (logError) {
    console.error('pm/end: could not record ending', logError)
    return NextResponse.json({ error: 'Could not end management. Try again.' }, { status: 500 })
  }

  // Staff access grants for this client go with it.
  const { data: members } = await admin.from('pm_organization_members').select('id').eq('organization_id', portfolio.organization_id)
  const memberIds = (members || []).map((m: any) => m.id)
  if (memberIds.length) {
    await admin.from('pm_staff_client_access').delete().eq('owner_user_id', portfolio.owner_user_id).in('member_id', memberIds)
  }

  const { error: deleteError } = await admin.from('pm_client_portfolios').delete().eq('id', portfolio.id)
  if (deleteError) {
    console.error('pm/end: delete failed', deleteError)
    return NextResponse.json({ error: 'Could not end management. Try again.' }, { status: 500 })
  }

  await logPmAction(admin, {
    organizationId: portfolio.organization_id,
    ownerUserId: portfolio.owner_user_id,
    actorUserId: user.id,
    action: 'relationship_ended',
    detail: side === 'owner' ? 'Ended by the owner' : 'Ended by the property manager',
  }).catch(() => {})

  // Tell the other side (and both sides get the deposit / fee checklist).
  const adminUserId = portfolio.pm_organizations?.admin_user_id
  const { data: people } = await admin
    .from('users')
    .select('id, email, full_name, preferred_language')
    .in('id', [portfolio.owner_user_id, adminUserId].filter(Boolean))
  const owner = (people || []).find((p: any) => p.id === portfolio.owner_user_id)
  const ownerName = owner?.full_name || 'The owner'
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'
  await Promise.all(
    (people || []).map(async (p: any) => {
      const recipientSide = p.id === portfolio.owner_user_id ? 'owner' : 'pm'
      // Access changed: always emailed.
      if (p.email) {
        await sendPmRelationshipEndedEmail({
          to: p.email,
          recipientSide,
          orgName,
          ownerName,
          endedBySide: side,
          depositsHeld,
          openJobsCount: o.openJobs.length,
          unpaidFees: o.unpaidFees,
          lang: p.preferred_language === 'es' ? 'es' : 'en',
        }).catch((err) => console.error('pm/end: email failed', err))
      }
      if (p.id !== user.id) {
        await sendPush(p.id, {
          title: 'Management ended',
          body: side === 'owner' ? `${ownerName} ended management with ${orgName}.` : `${orgName} ended management of your properties.`,
          url: `${site}/landlord/pm`,
        }).catch(() => {})
      }
    })
  )

  if (notifyTenants && o.tenancies.length > 0) {
    for (const t of o.tenancies) {
      const renterIds = await notifyRenterIds(admin, t.id, t.renterUserId)
      const { data: renters } = await admin.from('users').select('id, email, preferred_language, email_notifications_enabled').in('id', renterIds)
      await Promise.all(
        (renters || []).map(async (r: any) => {
          if (r.email && emailAllowed(r)) {
            await sendManagerChangedTenantEmail({ to: r.email, orgName, ownerName, address: t.address, lang: r.preferred_language === 'es' ? 'es' : 'en' }).catch(() => {})
          }
          await sendPush(r.id, { title: 'New contact for your home', body: `${ownerName} is now your contact for ${t.address}.`, url: `${site}/renter` }).catch(() => {})
        })
      )
    }
  }

  return NextResponse.json({ ok: true })
}
