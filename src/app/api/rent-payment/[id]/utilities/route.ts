import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getActionableOwnerIdsAdmin, getPmMembership, logPmAction } from '@/lib/pm'
import { notifyRenterIds } from '@/lib/coRenters'
import { sendPush } from '@/lib/push'
import { emailAllowed } from '@/lib/notificationPrefs'
import { sendUtilityBillsAddedEmail } from '@/lib/email'
import { hasCentPrecision } from '@/lib/bidRules'
import { UTILITY_KINDS, type UtilityKind, utilityName, loadUtilityCharges } from '@/lib/utilityCharges'

export const maxDuration = 20

type IncomingCharge = {
  id?: string
  clientKey?: string
  kind: UtilityKind
  label?: string | null
  amount: number
  periodStart?: string | null
  periodEnd?: string | null
  attachFile?: 'pdf' | 'jpg' | 'png' | null
}

const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
const round2 = (n: number) => Math.round(n * 100) / 100
const money = (n: number) => `$${n.toFixed(2)}`

// Loads a rent month and confirms the caller manages it: the owner, a
// co-owner, or their property manager. Tenants can view bills but never
// change them.
async function managedRentPayment(rentPaymentId: string) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const admin = getSupabaseAdmin()
  const { data: payment } = await admin
    .from('rent_payments')
    .select('id, month, expected_amount, actual_amount, utilities_amount, late_fee_applied, notes, tenancy_id, tenancies(renter_user_id, late_fee_amount, unit_id, units(unit_number, property_id, properties(id, address, owner_user_id)))')
    .eq('id', rentPaymentId)
    .maybeSingle()
  const tenancy = (payment as any)?.tenancies
  const property = tenancy?.units?.properties
  if (!payment || !property?.owner_user_id) {
    return { error: NextResponse.json({ error: 'Rent month not found' }, { status: 404 }) }
  }
  const actionable = await getActionableOwnerIdsAdmin(admin, user.id)
  if (!actionable.includes(property.owner_user_id)) {
    return { error: NextResponse.json({ error: 'Rent month not found' }, { status: 404 }) }
  }
  return { user, admin, payment: payment as any, tenancy, property, unit: tenancy.units }
}

// PUT: save a rent month's rent and its full list of utility bills at once.
// Body: { rent, charges: IncomingCharge[], note? }
// Returns signed upload slots for any charge with attachFile, which the
// browser uploads straight to storage and then confirms via ./attach.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await managedRentPayment(id)
  if ('error' in ctx) return ctx.error
  const { user, admin, payment, tenancy, property, unit } = ctx

  const body = (await request.json().catch(() => null)) as { rent?: unknown; charges?: unknown; note?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const rent = Number(body.rent)
  if (!Number.isFinite(rent) || rent < 0 || rent > 1_000_000 || !hasCentPrecision(rent)) {
    return NextResponse.json({ error: 'Enter a valid rent amount' }, { status: 400 })
  }
  if (!Array.isArray(body.charges) || body.charges.length > 12) {
    return NextResponse.json({ error: 'A month can have up to 12 bills' }, { status: 400 })
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 140) : ''

  const incoming: IncomingCharge[] = []
  for (const raw of body.charges as any[]) {
    const kind = raw?.kind
    const amount = Number(raw?.amount)
    if (!UTILITY_KINDS.includes(kind)) return NextResponse.json({ error: 'Choose a bill type' }, { status: 400 })
    if (!Number.isFinite(amount) || amount < 0 || amount > 100000 || !hasCentPrecision(amount)) {
      return NextResponse.json({ error: 'Enter each bill in dollars and cents, like 49.50' }, { status: 400 })
    }
    const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 40) : ''
    if (kind === 'other' && !label) return NextResponse.json({ error: 'Name the "Other" bill (for example, "Parking")' }, { status: 400 })
    const periodStart = raw.periodStart ? (isDate(raw.periodStart) ? raw.periodStart : null) : null
    const periodEnd = raw.periodEnd ? (isDate(raw.periodEnd) ? raw.periodEnd : null) : null
    if ((raw.periodStart && !periodStart) || (raw.periodEnd && !periodEnd)) {
      return NextResponse.json({ error: 'Check the bill dates' }, { status: 400 })
    }
    if (periodStart && periodEnd && periodEnd < periodStart) {
      return NextResponse.json({ error: "A bill's end date can't be before its start date" }, { status: 400 })
    }
    incoming.push({
      id: typeof raw.id === 'string' ? raw.id : undefined,
      clientKey: typeof raw.clientKey === 'string' ? raw.clientKey.slice(0, 40) : undefined,
      kind,
      label: kind === 'other' ? label : null,
      amount: round2(amount),
      periodStart,
      periodEnd,
      attachFile: ['pdf', 'jpg', 'png'].includes(raw.attachFile) ? raw.attachFile : null,
    })
  }

  const { data: existingRows, error: existingError } = await admin
    .from('rent_utility_charges')
    .select('id, kind, label, amount, period_start, period_end')
    .eq('rent_payment_id', id)
  if (existingError) {
    console.error('rent-payment/utilities: load failed', existingError)
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
  }
  const existing = new Map((existingRows || []).map((r: any) => [r.id, r]))
  for (const c of incoming) {
    if (c.id && !existing.has(c.id)) return NextResponse.json({ error: 'That bill no longer exists. Reload and try again.' }, { status: 409 })
  }

  // Work out what changed, for the month's history and the tenant's notice.
  const lateFee = payment.late_fee_applied ? Number(tenancy?.late_fee_amount || 0) : 0
  const oldUtilities = Number(payment.utilities_amount || 0)
  const oldRent = round2(Number(payment.expected_amount || 0) - oldUtilities - lateFee)
  const changes: string[] = []
  const tenantItems: { name: string; amount: number }[] = []
  if (round2(rent) !== oldRent) changes.push(`Rent ${money(oldRent)} → ${money(rent)}`)
  const keptIds = new Set(incoming.filter((c) => c.id).map((c) => c.id))
  for (const old of existingRows || []) {
    if (!keptIds.has((old as any).id)) changes.push(`Removed ${utilityName(old as any)} bill (${money(Number((old as any).amount))})`)
  }
  for (const c of incoming) {
    const name = utilityName(c)
    if (!c.id) {
      changes.push(`Added ${name} bill ${money(c.amount)}`)
      if (c.amount > 0) tenantItems.push({ name, amount: c.amount })
    } else {
      const old: any = existing.get(c.id)
      if (round2(Number(old.amount)) !== c.amount) {
        changes.push(`${name} ${money(Number(old.amount))} → ${money(c.amount)}`)
        if (c.amount > Number(old.amount)) tenantItems.push({ name, amount: c.amount })
      } else if (old.kind !== c.kind || (old.label || null) !== c.label || (old.period_start || null) !== c.periodStart || (old.period_end || null) !== c.periodEnd) {
        changes.push(`${name} bill details updated`)
      }
    }
  }
  if (note) changes.push(note)

  // Apply: delete removed, update kept, insert new.
  const toDelete = (existingRows || []).map((r: any) => r.id).filter((rid: string) => !keptIds.has(rid))
  if (toDelete.length > 0) {
    const { error } = await admin.from('rent_utility_charges').delete().in('id', toDelete)
    if (error) {
      console.error('rent-payment/utilities: delete failed', error)
      return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
    }
  }
  const saved: { id: string; clientKey?: string; attachFile?: IncomingCharge['attachFile']; kind: UtilityKind }[] = []
  for (const c of incoming) {
    const row = { kind: c.kind, label: c.label, amount: c.amount, period_start: c.periodStart, period_end: c.periodEnd }
    if (c.id) {
      const { error } = await admin.from('rent_utility_charges').update(row).eq('id', c.id).eq('rent_payment_id', id)
      if (error) {
        console.error('rent-payment/utilities: update failed', error)
        return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
      }
      saved.push({ id: c.id, clientKey: c.clientKey, attachFile: c.attachFile, kind: c.kind })
    } else {
      const { data, error } = await admin
        .from('rent_utility_charges')
        .insert({ ...row, rent_payment_id: id, created_by: user.id })
        .select('id')
        .single()
      if (error || !data) {
        console.error('rent-payment/utilities: insert failed', error)
        return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
      }
      saved.push({ id: data.id, clientKey: c.clientKey, attachFile: c.attachFile, kind: c.kind })
    }
  }

  const utilities = round2(incoming.reduce((sum, c) => sum + c.amount, 0))
  const water = round2(incoming.filter((c) => c.kind === 'water').reduce((sum, c) => sum + c.amount, 0))
  const total = round2(rent + utilities + lateFee)
  const update: Record<string, unknown> = { expected_amount: total, utilities_amount: utilities, water_amount: water }
  if (changes.length > 0) {
    const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    update.notes = [payment.notes, `${stamp}: ${changes.join(' · ')}`].filter(Boolean).join('\n')
  }
  const { error: updateError } = await admin.from('rent_payments').update(update).eq('id', id)
  if (updateError) {
    console.error('rent-payment/utilities: rent update failed', updateError)
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
  }

  // Signed upload slots: the browser sends the file straight to storage
  // (bills can be 20 MB scans, over the hosting request limit).
  const uploads: { chargeId: string; clientKey?: string; path: string; token: string }[] = []
  for (const s of saved.filter((x) => x.attachFile)) {
    const path = `${property.id}/utility-${s.id}-${crypto.randomUUID()}.${s.attachFile}`
    const { data, error } = await admin.storage.from('documents').createSignedUploadUrl(path)
    if (!error && data) uploads.push({ chargeId: s.id, clientKey: s.clientKey, path: data.path, token: data.token })
  }

  // PM transparency: the owner sees this in their PM activity feed.
  if (user.id !== property.owner_user_id && changes.length > 0) {
    const membership = await getPmMembership(admin, user.id)
    if (membership) {
      await logPmAction(admin, {
        organizationId: membership.organizationId,
        ownerUserId: property.owner_user_id,
        actorUserId: user.id,
        action: 'rent_month_updated',
        detail: `${property.address}${unit?.unit_number ? `, Unit ${unit.unit_number}` : ''}: ${changes.join(' · ')}`.slice(0, 300),
      }).catch(() => {})
    }
  }

  if (tenantItems.length > 0 && tenancy?.renter_user_id) {
    await notifyTenants({ admin, tenancyId: payment.tenancy_id, primaryRenterId: tenancy.renter_user_id, items: tenantItems, total, paidSoFar: Number(payment.actual_amount || 0), month: payment.month, address: property.address, unitNumber: unit?.unit_number })
  }

  const charges = await loadUtilityCharges(admin, [id]).catch(() => [])
  return NextResponse.json({ ok: true, total, utilities, charges, saved, uploads })
}

async function notifyTenants({
  admin, tenancyId, primaryRenterId, items, total, paidSoFar, month, address, unitNumber,
}: {
  admin: ReturnType<typeof getSupabaseAdmin>
  tenancyId: string
  primaryRenterId: string
  items: { name: string; amount: number }[]
  total: number
  paidSoFar: number
  month: string
  address: string
  unitNumber?: string | null
}) {
  const renterIds = await notifyRenterIds(admin, tenancyId, primaryRenterId)
  const { data: renters } = await admin
    .from('users')
    .select('id, email, preferred_language, email_notifications_enabled')
    .in('id', renterIds)
  const monthDate = new Date(month + 'T00:00:00')
  const unitLabel = `${address}${unitNumber ? `, Unit ${unitNumber}` : ''}`
  const due = round2(Math.max(0, total - paidSoFar))
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'
  const summary = items.map((i) => `${i.name} ${money(i.amount)}`).join(', ')

  await Promise.all(
    (renters || []).map(async (r: any) => {
      const lang = r.preferred_language === 'es' ? 'es' : 'en'
      const monthLabel = monthDate.toLocaleDateString(lang === 'es' ? 'es' : 'en-US', { month: 'long' })
      if (r.email && emailAllowed(r)) {
        await sendUtilityBillsAddedEmail({ to: r.email, unitLabel, monthDate, items, total, due, lang }).catch((err) =>
          console.error('rent-payment/utilities: email failed', err)
        )
      }
      await sendPush(r.id, {
        title: lang === 'es' ? 'Nueva factura de servicios' : items.length > 1 ? 'New utility bills' : 'New utility bill',
        body: lang === 'es' ? `${summary} en tu renta de ${monthLabel}. Total: ${money(total)}` : `${summary} added to your ${monthLabel} rent. Total: ${money(total)}`,
        url: `${site}/renter/rent`,
      }).catch((err) => console.error('rent-payment/utilities: push failed', err))
    })
  )
}
