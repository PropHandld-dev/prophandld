import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership } from '@/lib/pm'
import { sendPmFeeProposedEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'

export const maxDuration = 20

// Admin-only: update a client relationship (fee proposal, monthly summary,
// read-only mode). The approval limit is NOT settable here -- owner-only.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const membership = await getPmMembership(supabaseAdmin, user.id)
  if (!membership || membership.memberRole !== 'admin') {
    return NextResponse.json({ error: 'Only a PM organization admin can change client settings' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    approvalThreshold?: number
    managementFee?: number | null
    managementFeeFrequency?: 'one_time' | 'monthly' | null
    managementFeeType?: 'flat' | 'percent_of_rent'
    managementFeePercent?: number | null
    monthlySummaryEnabled?: boolean
    monthlySummaryNote?: string | null
    ownerReadOnly?: boolean
  }

  const update: Record<string, unknown> = {}
  // The approval limit is the OWNER's permission grant to the PM -- only
  // they set it (at accept time, or later via PATCH /api/pm/my-status).
  // A PM changing it would be granting themselves authority.
  if (body.approvalThreshold !== undefined) {
    return NextResponse.json({ error: 'Only the property owner can change their approval limit.' }, { status: 403 })
  }
  // managementFeeType governs which of the two amount fields is "live" —
  // sent together from the UI's own type toggle, not independently, so
  // switching from flat to percent (or back) always clears the other
  // field rather than leaving a stale value a reader might mistake for
  // still being in effect.
  if (body.managementFeeType !== undefined) {
    if (body.managementFeeType !== 'flat' && body.managementFeeType !== 'percent_of_rent') {
      return NextResponse.json({ error: 'Invalid fee type' }, { status: 400 })
    }
    update.management_fee_type = body.managementFeeType
    if (body.managementFeeType === 'percent_of_rent') {
      if (typeof body.managementFeePercent !== 'number' || body.managementFeePercent <= 0 || body.managementFeePercent > 100) {
        return NextResponse.json({ error: 'Invalid percentage' }, { status: 400 })
      }
      update.management_fee_percent = body.managementFeePercent
      update.management_fee = null
      update.management_fee_frequency = 'monthly'
    } else {
      update.management_fee_percent = null
      if (body.managementFee !== undefined) {
        if (body.managementFee !== null && (typeof body.managementFee !== 'number' || body.managementFee < 0)) {
          return NextResponse.json({ error: 'Invalid management fee' }, { status: 400 })
        }
        update.management_fee = body.managementFee
        update.management_fee_frequency = body.managementFee === null ? null : body.managementFeeFrequency || 'monthly'
      }
    }
  } else if (body.managementFee !== undefined) {
    if (body.managementFee !== null && (typeof body.managementFee !== 'number' || body.managementFee < 0)) {
      return NextResponse.json({ error: 'Invalid management fee' }, { status: 400 })
    }
    update.management_fee = body.managementFee
    update.management_fee_frequency = body.managementFee === null ? null : body.managementFeeFrequency || 'monthly'
  }
  if (body.monthlySummaryEnabled !== undefined) {
    if (typeof body.monthlySummaryEnabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
    }
    update.monthly_summary_enabled = body.monthlySummaryEnabled
  }
  if (body.monthlySummaryNote !== undefined) {
    if (body.monthlySummaryNote !== null && (typeof body.monthlySummaryNote !== 'string' || body.monthlySummaryNote.length > 1000)) {
      return NextResponse.json({ error: 'Note must be 1000 characters or fewer' }, { status: 400 })
    }
    update.monthly_summary_note = body.monthlySummaryNote?.trim() || null
  }
  if (body.ownerReadOnly !== undefined) {
    if (typeof body.ownerReadOnly !== 'boolean') {
      return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
    }
    update.owner_read_only = body.ownerReadOnly
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  // Any change to what the owner pays is a new proposal, never a silent
  // new charge: clearing the owner's approval here blocks both the manual
  // "Pay now" route and cron/pm-fee-billing until the owner approves the
  // new terms themselves.
  const feeChanged = 'management_fee' in update || 'management_fee_type' in update || 'management_fee_percent' in update || 'management_fee_frequency' in update
  if (feeChanged) update.fee_owner_approved_at = null

  const { data: updated, error } = await supabaseAdmin
    .from('pm_client_portfolios')
    .update(update)
    .eq('id', portfolioId)
    .eq('organization_id', membership.organizationId)
    .select('id, owner_user_id, management_fee, management_fee_type, management_fee_percent, management_fee_frequency')

  if (error) {
    console.error('pm/clients/[portfolioId]: error updating client', error)
    return NextResponse.json({ error: 'Could not update that client' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const row = updated[0] as any

  // Hands-off mode changes what the owner can do on their own property
  // (they can no longer pay contractors directly), so they're always told.
  if (body.ownerReadOnly !== undefined && row.owner_user_id) {
    await sendPush(row.owner_user_id, {
      title: body.ownerReadOnly ? `${membership.organizationName} now pays your contractors` : `You can pay contractors again`,
      body: body.ownerReadOnly
        ? 'Hands-off mode is on: your property manager handles contractor payments. You still see everything.'
        : `${membership.organizationName} turned off hands-off mode. You can pay contractors directly again.`,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord/pm`,
    }).catch((err) => console.error('pm/clients/[portfolioId]: read-only push failed', err))
  }

  const hasFee = row.management_fee_type === 'percent_of_rent' ? Number(row.management_fee_percent) > 0 : Number(row.management_fee) > 0
  if (feeChanged && hasFee && row.owner_user_id) {
    const { data: owner } = await supabaseAdmin
      .from('users')
      .select('email, full_name, preferred_language, email_notifications_enabled')
      .eq('id', row.owner_user_id)
      .maybeSingle()
    const feeLabel =
      row.management_fee_type === 'percent_of_rent'
        ? `${Number(row.management_fee_percent)}% of rent collected, monthly`
        : `$${Number(row.management_fee).toFixed(2)}${row.management_fee_frequency === 'monthly' ? ' per month' : ' one time'}`
    if (owner?.email && emailAllowed(owner)) {
      await sendPmFeeProposedEmail({
        to: owner.email,
        landlordName: owner.full_name || 'there',
        orgName: membership.organizationName,
        feeLabel,
        lang: owner.preferred_language === 'es' ? 'es' : 'en',
      }).catch((err) => console.error('pm/clients/[portfolioId]: fee-proposed email failed', err))
    }
    await sendPush(row.owner_user_id, {
      title: 'New management fee to review',
      body: `${membership.organizationName} proposed ${feeLabel}. Nothing is charged until you approve.`,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/landlord/pm`,
    }).catch((err) => console.error('pm/clients/[portfolioId]: fee-proposed push failed', err))
  }

  return NextResponse.json({ ok: true })
}

// Owner declines/leaves, or an org ADMIN removes a client — not staff.
// Property data and history are untouched; this only removes the link.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ portfolioId: string }> }) {
  const { portfolioId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const membership = await getPmMembership(supabaseAdmin, user.id)

  // Caught in testing: this used to branch on "is this caller in a PM org
  // at all," which let any accepted STAFF member remove a client
  // relationship, not just an admin — the UI's own Remove button was
  // already admin-gated, but the route itself wasn't, so a change there
  // (or a direct request) would have silently allowed it.
  let query = supabaseAdmin.from('pm_client_portfolios').delete().eq('id', portfolioId)
  if (membership?.memberRole === 'admin') {
    query = query.eq('organization_id', membership.organizationId)
  } else {
    query = query.eq('owner_user_id', user.id)
  }
  const { data: deleted, error } = await query.select('id')

  if (error) {
    console.error('pm/clients/[portfolioId]: error removing', error)
    return NextResponse.json({ error: 'Could not remove that client' }, { status: 500 })
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
