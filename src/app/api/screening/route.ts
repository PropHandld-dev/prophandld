import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { canActForOwner } from '@/lib/pm'
import { sendPmNoticeEmail } from '@/lib/email'
import { tooManyRequests } from '@/lib/rateLimit'

export const maxDuration = 15

async function unitContext(unitId: string) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  const admin = getSupabaseAdmin()
  const { data: unit } = await admin.from('units').select('id, unit_number, properties(address, owner_user_id)').eq('id', unitId).maybeSingle()
  const prop: any = (unit as any)?.properties
  if (!unit || !prop || !(await canActForOwner(admin, user.id, prop.owner_user_id))) return { error: NextResponse.json({ error: 'Unit not found' }, { status: 404 }) }
  return { user, admin, unit: unit as any, prop }
}

export async function GET(request: NextRequest) {
  const ctx = await unitContext(request.nextUrl.searchParams.get('unitId') || '')
  if ('error' in ctx) return ctx.error
  const { data } = await ctx.admin
    .from('screening_requests')
    .select('id, applicant_name, applicant_email, status, note, created_at, decided_at')
    .eq('unit_id', ctx.unit.id)
    .order('created_at', { ascending: false })
    .limit(50)
  return NextResponse.json({ requests: data || [] })
}

// POST { unitId, applicantName, applicantEmail }
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => ({}))) as Record<string, any>
  const ctx = await unitContext(b.unitId || '')
  if ('error' in ctx) return ctx.error
  const { user, admin, unit, prop } = ctx
  const name = typeof b.applicantName === 'string' ? b.applicantName.trim().slice(0, 120) : ''
  const email = typeof b.applicantEmail === 'string' ? b.applicantEmail.trim().toLowerCase().slice(0, 200) : ''
  if (!name) return NextResponse.json({ error: "Enter the applicant's name" }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter the applicant's email" }, { status: 400 })
  if (await tooManyRequests(`screening:${user.id}`, 20, 60)) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })

  const { data: row, error } = await admin
    .from('screening_requests')
    .insert({ unit_id: unit.id, owner_user_id: prop.owner_user_id, created_by: user.id, applicant_name: name, applicant_email: email })
    .select('id')
    .single()
  if (error || !row) return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })

  const { data: me } = await admin.from('users').select('full_name').eq('id', user.id).maybeSingle()
  const place = `${prop.address}${unit.unit_number && unit.unit_number !== 'Main' ? `, Unit ${unit.unit_number}` : ''}`
  await sendPmNoticeEmail({
    to: email,
    subject: `Next step for your application: ${place}`,
    eyebrow: 'Rental application',
    heading: `Screening for ${place}`,
    body: `Hi ${name.split(' ')[0]},\n\n${me?.full_name || 'The landlord'} would like to run a tenant screening (credit, criminal and eviction history) through TransUnion SmartMove. You'll get a separate email from SmartMove with a secure link. You enter your details and consent directly with them; Prophandld never sees your report or your Social Security number.\n\nIf you don't see it within a day, check your spam folder or reply to the landlord.`,
    ctaLabel: 'About SmartMove',
    ctaUrl: 'https://www.mysmartmove.com/renter',
  }).catch((err) => console.error('screening: email failed', err))

  return NextResponse.json({ ok: true, id: row.id })
}
