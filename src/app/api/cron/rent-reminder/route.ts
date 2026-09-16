import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { ensureCurrentMonthRentPayment } from '@/lib/rentAutomation'
import { sendRentDueEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'

// Runs daily (see vercel.json) — idempotent, so a missed or repeated run
// is harmless. Ensures every active tenancy has this month's rent row
// (expected_amount pulled from tenancies.rent_amount, no typing needed),
// and notifies the landlord once per unit the first time that row is
// created for the month, not on every run.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: tenancies, error } = await supabaseAdmin
    .from('tenancies')
    .select('id, rent_amount, unit_id, units(unit_number, properties(address, owner_user_id))')
    .eq('ended', false)
    .not('rent_amount', 'is', null)

  if (error) {
    console.error('cron/rent-reminder: error fetching tenancies', error)
    return NextResponse.json({ error: 'Could not fetch tenancies' }, { status: 500 })
  }

  const newlyCreatedByLandlord: Record<string, string[]> = {}

  for (const tenancy of tenancies || []) {
    const createdId = await ensureCurrentMonthRentPayment(supabaseAdmin, tenancy.id, tenancy.rent_amount)
    if (!createdId) continue

    const unit = tenancy.units as any
    const landlordUserId = unit?.properties?.owner_user_id
    if (!landlordUserId) continue

    const unitLabel = `${unit?.properties?.address || 'a property'}${unit?.unit_number ? ` — Unit ${unit.unit_number}` : ''}`
    if (!newlyCreatedByLandlord[landlordUserId]) newlyCreatedByLandlord[landlordUserId] = []
    newlyCreatedByLandlord[landlordUserId].push(unitLabel)
  }

  await Promise.allSettled(
    Object.entries(newlyCreatedByLandlord).map(async ([landlordUserId, unitLabels]) => {
      const { data: landlord } = await supabaseAdmin.from('users').select('email, full_name').eq('id', landlordUserId).maybeSingle()
      if (landlord?.email) {
        await sendRentDueEmail({ to: landlord.email, landlordName: landlord.full_name || 'there', unitLabels })
      }
      await sendPush(landlordUserId, {
        title: 'Rent due',
        body: unitLabels.length === 1 ? `${unitLabels[0]} — mark it received once it's in.` : `${unitLabels.length} units — mark rent received once it's in.`,
        url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://prophandld.com'}/landlord`,
      }).catch((err) => console.error('cron/rent-reminder: sendPush failed', err))
    })
  )

  return NextResponse.json({ ok: true, landlordsNotified: Object.keys(newlyCreatedByLandlord).length })
}
