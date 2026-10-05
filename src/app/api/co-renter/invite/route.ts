import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendCoRenterInviteEmail } from '@/lib/email'

// Previously, trying to add a co-renter who hadn't signed up yet was a
// dead end: "No Prophandld account found with that email," full stop.
// This gives the landlord a real next step instead.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { tenancyId, email } = (await request.json()) as { tenancyId?: string; email?: string }
  if (!tenancyId || !email?.trim()) {
    return NextResponse.json({ error: 'Missing tenancyId or email' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: tenancy, error: tenancyError } = await supabaseAdmin
    .from('tenancies')
    .select('id, units(unit_number, properties(address, owner_user_id))')
    .eq('id', tenancyId)
    .maybeSingle()

  if (tenancyError || !tenancy) {
    return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  }

  const unit = tenancy.units as any
  if (unit?.properties?.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized for this unit' }, { status: 403 })
  }

  const { data: landlordData } = await supabaseAdmin.from('users').select('full_name').eq('id', user.id).maybeSingle()
  const unitLabel = `${unit?.properties?.address || 'your unit'}${unit?.unit_number ? `, Unit ${unit.unit_number}` : ''}`

  const result = await sendCoRenterInviteEmail({
    to: email.trim().toLowerCase(),
    landlordName: landlordData?.full_name || 'Your landlord',
    unitLabel,
  })

  if (!result.ok) {
    console.error('co-renter/invite: sendEmail failed', result)
    return NextResponse.json({ error: 'Could not send invite email' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
