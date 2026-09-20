import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { rentMonthBounds } from '@/lib/rentAutomation'
import { sendRentDueEmail, sendRentDueRenterEmail, sendRentLateRenterEmail, sendRentLateLandlordEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'

export const maxDuration = 60

const PAGE_SIZE = 500
const ID_CHUNK = 100
const CONCURRENCY = 10

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// Runs tasks with a bounded number in flight — parallel enough to finish
// quickly, not so wide that it hammers the email provider or database.
async function runInBatches<T>(items: T[], task: (item: T) => Promise<void>) {
  for (const batch of chunk(items, CONCURRENCY)) {
    const results = await Promise.allSettled(batch.map(task))
    results.forEach((r) => {
      if (r.status === 'rejected') console.error('cron/rent-reminder: task failed', r.reason)
    })
  }
}

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
//
// Written to scale: tenancies are read in pages (Supabase caps a single
// query at 1000 rows and silently drops the rest), rows are looked up and
// created in bulk instead of per tenancy, and notifications go out a few at
// a time rather than one after another.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const tenancies: any[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('tenancies')
      .select('id, rent_amount, unit_id, renter_user_id, late_fee_amount, grace_period_days, rent_due_day, units(unit_number, properties(address, owner_user_id))')
      .eq('ended', false)
      .not('rent_amount', 'is', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.error('cron/rent-reminder: error fetching tenancies', error)
      return NextResponse.json({ error: 'Could not fetch tenancies' }, { status: 500 })
    }
    tenancies.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }

  const { month, following, firstDate } = rentMonthBounds(0)

  // This month's existing rows, in bulk.
  const paymentByTenancy = new Map<string, any>()
  for (const ids of chunk(tenancies.map((t) => t.id), ID_CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from('rent_payments')
      .select('id, tenancy_id, expected_amount, actual_amount, late_fee_applied, reminder_sent_at')
      .in('tenancy_id', ids)
      .gte('month', month)
      .lt('month', following)
    if (error) {
      console.error('cron/rent-reminder: error fetching rent payments', error)
      return NextResponse.json({ error: 'Could not fetch rent payments' }, { status: 500 })
    }
    for (const row of data || []) if (!paymentByTenancy.has(row.tenancy_id)) paymentByTenancy.set(row.tenancy_id, row)
  }

  // Create whatever's missing, in bulk.
  const missing = tenancies.filter((t) => !paymentByTenancy.has(t.id))
  const createdTenancyIds = new Set<string>()
  for (const batch of chunk(missing, ID_CHUNK)) {
    const { data, error } = await supabaseAdmin
      .from('rent_payments')
      .insert(batch.map((t) => ({ tenancy_id: t.id, month, expected_amount: t.rent_amount })))
      .select('id, tenancy_id, expected_amount, actual_amount, late_fee_applied, reminder_sent_at')
    if (error) {
      console.error('cron/rent-reminder: bulk insert failed', error)
      continue
    }
    for (const row of data || []) {
      paymentByTenancy.set(row.tenancy_id, row)
      createdTenancyIds.add(row.tenancy_id)
    }
  }

  // People we may need to email, in bulk.
  const renterIds = Array.from(new Set(tenancies.map((t) => t.renter_user_id).filter(Boolean)))
  const landlordIds = Array.from(new Set(tenancies.map((t) => t.units?.properties?.owner_user_id).filter(Boolean)))
  const userById = new Map<string, { email: string | null; full_name: string | null }>()
  for (const ids of chunk(Array.from(new Set([...renterIds, ...landlordIds])), ID_CHUNK)) {
    const { data } = await supabaseAdmin.from('users').select('id, email, full_name').in('id', ids)
    for (const u of data || []) userById.set(u.id, u)
  }

  const unitLabelOf = (t: any) =>
    `${t.units?.properties?.address || 'a property'}${t.units?.unit_number ? `, Unit ${t.units.unit_number}` : ''}`
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://prophandld.com'

  // Newly created rows: notify the renter now, and collect units per landlord
  // for a single digest.
  const newlyCreatedByLandlord: Record<string, string[]> = {}
  let dueRenterNotifications = 0

  await runInBatches(tenancies.filter((t) => createdTenancyIds.has(t.id)), async (tenancy) => {
    const landlordUserId = tenancy.units?.properties?.owner_user_id
    const unitLabel = unitLabelOf(tenancy)
    if (landlordUserId) (newlyCreatedByLandlord[landlordUserId] ||= []).push(unitLabel)

    if (tenancy.renter_user_id) {
      const renter = userById.get(tenancy.renter_user_id)
      if (renter?.email) {
        await sendRentDueRenterEmail({ to: renter.email, unitLabel, amount: Number(tenancy.rent_amount) })
        dueRenterNotifications++
      }
      await sendPush(tenancy.renter_user_id, {
        title: 'Rent due',
        body: `$${Number(tenancy.rent_amount).toFixed(2)} due for ${unitLabel}`,
        url: `${siteUrl}/renter/rent`,
      }).catch((err) => console.error('cron/rent-reminder: sendPush (renter due) failed', err))
    }
  })

  // Late check — current month only, regardless of whether it was just created.
  let lateNotifications = 0
  const lateCandidates = tenancies.filter((tenancy) => {
    const rentPayment = paymentByTenancy.get(tenancy.id)
    if (!rentPayment || rentPayment.reminder_sent_at) return false
    if (Number(rentPayment.actual_amount || 0) >= Number(rentPayment.expected_amount || 0)) return false
    const dueDate = new Date(firstDate.getFullYear(), firstDate.getMonth(), tenancy.rent_due_day ?? 1)
    const daysSinceDue = Math.floor((Date.now() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
    return daysSinceDue >= (tenancy.grace_period_days ?? 5)
  })

  await runInBatches(lateCandidates, async (tenancy) => {
    const rentPayment = paymentByTenancy.get(tenancy.id)
    const landlordUserId = tenancy.units?.properties?.owner_user_id
    const unitLabel = unitLabelOf(tenancy)

    let lateFeeAdded: number | null = null
    const updates: Record<string, unknown> = { reminder_sent_at: new Date().toISOString() }

    if (tenancy.late_fee_amount && !rentPayment.late_fee_applied) {
      lateFeeAdded = Number(tenancy.late_fee_amount)
      updates.expected_amount = Number(rentPayment.expected_amount) + lateFeeAdded
      updates.late_fee_applied = true
    }

    await supabaseAdmin.from('rent_payments').update(updates).eq('id', rentPayment.id)

    if (tenancy.renter_user_id) {
      const renter = userById.get(tenancy.renter_user_id)
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
        url: `${siteUrl}/renter/rent`,
      }).catch((err) => console.error('cron/rent-reminder: sendPush (renter late) failed', err))
    }

    if (landlordUserId) {
      const landlord = userById.get(landlordUserId)
      if (landlord?.email) {
        await sendRentLateLandlordEmail({ to: landlord.email, landlordName: landlord.full_name || 'there', unitLabel, lateFeeAdded })
      }
    }

    lateNotifications++
  })

  // One digest per landlord for the newly created rows.
  await runInBatches(Object.entries(newlyCreatedByLandlord), async ([landlordUserId, unitLabels]) => {
    const landlord = userById.get(landlordUserId)
    if (landlord?.email) {
      await sendRentDueEmail({ to: landlord.email, landlordName: landlord.full_name || 'there', unitLabels })
    }
    await sendPush(landlordUserId, {
      title: 'Rent due',
      body: unitLabels.length === 1 ? `${unitLabels[0]}: mark it received once it's in.` : `${unitLabels.length} units: mark rent received once it's in.`,
      url: `${siteUrl}/landlord`,
    }).catch((err) => console.error('cron/rent-reminder: sendPush failed', err))
  })

  return NextResponse.json({
    ok: true,
    tenancies: tenancies.length,
    rowsCreated: createdTenancyIds.size,
    landlordsNotified: Object.keys(newlyCreatedByLandlord).length,
    dueRenterNotifications,
    lateNotifications,
  })
}
