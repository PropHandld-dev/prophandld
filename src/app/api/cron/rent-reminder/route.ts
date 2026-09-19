import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { ensureCurrentMonthRentPayment } from '@/lib/rentAutomation'
import { sendRentDueEmail, sendRentDueRenterEmail, sendRentLateRenterEmail, sendRentLateLandlordEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'

// Runs daily (see vercel.json) — idempotent, so a missed or repeated run
// is harmless.
//
// Two responsibilities:
// 1. Ensure every active tenancy has this month's rent row (expected_amount
//    pulled from tenancies.rent_amount, no typing needed) and notify both
//    the landlord and renter the first time that row is created.
// 2. Once a tenancy's grace period has passed with rent still unpaid, apply
//    an optional landlord-configured late fee (added transparently to
//    expected_amount, never auto-charged) and send a one-time late notice
//    to both sides — gated on reminder_sent_at so it only fires once.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: tenancies, error } = await supabaseAdmin
    .from('tenancies')
    .select('id, rent_amount, unit_id, renter_user_id, late_fee_amount, grace_period_days, units(unit_number, properties(address, owner_user_id))')
    .eq('ended', false)
    .not('rent_amount', 'is', null)

  if (error) {
    console.error('cron/rent-reminder: error fetching tenancies', error)
    return NextResponse.json({ error: 'Could not fetch tenancies' }, { status: 500 })
  }

  const newlyCreatedByLandlord: Record<string, string[]> = {}
  let dueRenterNotifications = 0
  let lateNotifications = 0

  for (const tenancy of tenancies || []) {
    const unit = tenancy.units as any
    const landlordUserId = unit?.properties?.owner_user_id
    const unitLabel = `${unit?.properties?.address || 'a property'}${unit?.unit_number ? `, Unit ${unit.unit_number}` : ''}`

    const createdId = await ensureCurrentMonthRentPayment(supabaseAdmin, tenancy.id, tenancy.rent_amount)
    if (createdId) {
      if (landlordUserId) {
        if (!newlyCreatedByLandlord[landlordUserId]) newlyCreatedByLandlord[landlordUserId] = []
        newlyCreatedByLandlord[landlordUserId].push(unitLabel)
      }

      if (tenancy.renter_user_id) {
        const { data: renter } = await supabaseAdmin.from('users').select('email').eq('id', tenancy.renter_user_id).maybeSingle()
        if (renter?.email) {
          await sendRentDueRenterEmail({ to: renter.email, unitLabel, amount: Number(tenancy.rent_amount) })
          dueRenterNotifications++
        }
        await sendPush(tenancy.renter_user_id, {
          title: 'Rent due',
          body: `$${Number(tenancy.rent_amount).toFixed(2)} due for ${unitLabel}`,
          url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://prophandld.com'}/renter/rent`,
        }).catch((err) => console.error('cron/rent-reminder: sendPush (renter due) failed', err))
      }
    }

    // Late check — current month only, regardless of whether it was just created.
    const monthStart = new Date()
    monthStart.setDate(1)
    const month = monthStart.toISOString().slice(0, 10)

    const { data: rentPayment } = await supabaseAdmin
      .from('rent_payments')
      .select('id, expected_amount, actual_amount, late_fee_applied, reminder_sent_at')
      .eq('tenancy_id', tenancy.id)
      .eq('month', month)
      .maybeSingle()

    if (!rentPayment || rentPayment.reminder_sent_at) continue

    const isUnpaid = Number(rentPayment.actual_amount || 0) < Number(rentPayment.expected_amount || 0)
    if (!isUnpaid) continue

    const gracePeriodDays = tenancy.grace_period_days ?? 5
    const daysSinceDue = Math.floor((Date.now() - monthStart.getTime()) / (24 * 60 * 60 * 1000))
    if (daysSinceDue < gracePeriodDays) continue

    let lateFeeAdded: number | null = null
    const updates: Record<string, unknown> = { reminder_sent_at: new Date().toISOString() }

    if (tenancy.late_fee_amount && !rentPayment.late_fee_applied) {
      lateFeeAdded = Number(tenancy.late_fee_amount)
      updates.expected_amount = Number(rentPayment.expected_amount) + lateFeeAdded
      updates.late_fee_applied = true
    }

    await supabaseAdmin.from('rent_payments').update(updates).eq('id', rentPayment.id)

    if (tenancy.renter_user_id) {
      const { data: renter } = await supabaseAdmin.from('users').select('email').eq('id', tenancy.renter_user_id).maybeSingle()
      if (renter?.email) {
        await sendRentLateRenterEmail({
          to: renter.email,
          unitLabel,
          amount: Number(updates.expected_amount ?? rentPayment.expected_amount),
          lateFeeAdded,
        })
      }
      await sendPush(tenancy.renter_user_id, {
        title: 'Rent is late',
        body: lateFeeAdded ? `${unitLabel}: a $${lateFeeAdded.toFixed(2)} late fee was added.` : `${unitLabel} is past due.`,
        url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://prophandld.com'}/renter/rent`,
      }).catch((err) => console.error('cron/rent-reminder: sendPush (renter late) failed', err))
    }

    if (landlordUserId) {
      const { data: landlord } = await supabaseAdmin.from('users').select('email, full_name').eq('id', landlordUserId).maybeSingle()
      if (landlord?.email) {
        await sendRentLateLandlordEmail({ to: landlord.email, landlordName: landlord.full_name || 'there', unitLabel, lateFeeAdded })
      }
    }

    lateNotifications++
  }

  await Promise.allSettled(
    Object.entries(newlyCreatedByLandlord).map(async ([landlordUserId, unitLabels]) => {
      const { data: landlord } = await supabaseAdmin.from('users').select('email, full_name').eq('id', landlordUserId).maybeSingle()
      if (landlord?.email) {
        await sendRentDueEmail({ to: landlord.email, landlordName: landlord.full_name || 'there', unitLabels })
      }
      await sendPush(landlordUserId, {
        title: 'Rent due',
        body: unitLabels.length === 1 ? `${unitLabels[0]}: mark it received once it's in.` : `${unitLabels.length} units: mark rent received once it's in.`,
        url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://prophandld.com'}/landlord`,
      }).catch((err) => console.error('cron/rent-reminder: sendPush failed', err))
    })
  )

  return NextResponse.json({
    ok: true,
    landlordsNotified: Object.keys(newlyCreatedByLandlord).length,
    dueRenterNotifications,
    lateNotifications,
  })
}
