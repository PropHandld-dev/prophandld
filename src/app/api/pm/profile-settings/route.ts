import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getPmMembership } from '@/lib/pm'
import { ensureOrgSlug } from '@/lib/pmSlug'

export const maxDuration = 15

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const membership = await getPmMembership(admin, user.id)
  if (!membership) {
    return NextResponse.json({ error: 'Not a property management org member' }, { status: 403 })
  }

  const { data: org } = await admin
    .from('pm_organizations')
    .select('slug, open_to_clients, pitch, license_number, insured, years_in_business, specialties, service_zips, pricing_note')
    .eq('id', membership.organizationId)
    .maybeSingle()

  let viewsTotal = 0
  let viewsThisMonth = 0
  if (org?.slug) {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const [{ count: total }, { count: thisMonth }] = await Promise.all([
      admin.from('pm_profile_views').select('id', { count: 'exact', head: true }).eq('organization_id', membership.organizationId),
      admin
        .from('pm_profile_views')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', membership.organizationId)
        .gte('viewed_at', monthStart.toISOString()),
    ])
    viewsTotal = total || 0
    viewsThisMonth = thisMonth || 0
  }

  return NextResponse.json({
    slug: org?.slug || null,
    openToClients: !!org?.open_to_clients,
    pitch: org?.pitch || '',
    licenseNumber: org?.license_number || '',
    insured: !!org?.insured,
    yearsInBusiness: org?.years_in_business ?? null,
    specialties: org?.specialties || [],
    serviceZips: org?.service_zips || [],
    pricingNote: org?.pricing_note || '',
    viewsTotal,
    viewsThisMonth,
  })
}

const VALID_SPECIALTIES = ['single_family', 'multifamily', 'short_term', 'commercial', 'hoa'] as const

// Admin-only: turn public discoverability on/off and set the one-line
// pitch shown on the directory and the org's own shareable profile page.
// Enabling it for the first time generates the slug that URL needs --
// deliberately not asked for at org-creation time, since most PM admins
// creating an org just want to invite their first client, not think
// about a public listing yet.
export async function PATCH(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const membership = await getPmMembership(admin, user.id)
  if (!membership || membership.memberRole !== 'admin') {
    return NextResponse.json({ error: 'Only a PM organization admin can change this' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    openToClients?: boolean
    pitch?: string
    licenseNumber?: string
    insured?: boolean
    yearsInBusiness?: number | null
    specialties?: string[]
    serviceZips?: string[]
    pricingNote?: string
  }
  const update: Record<string, unknown> = {}

  if (body.openToClients !== undefined) {
    if (typeof body.openToClients !== 'boolean') {
      return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
    }
    update.open_to_clients = body.openToClients
  }
  if (body.pitch !== undefined) {
    if (typeof body.pitch !== 'string' || body.pitch.length > 280) {
      return NextResponse.json({ error: 'Pitch must be 280 characters or fewer' }, { status: 400 })
    }
    update.pitch = body.pitch.trim() || null
  }
  if (body.licenseNumber !== undefined) {
    if (typeof body.licenseNumber !== 'string' || body.licenseNumber.length > 60) {
      return NextResponse.json({ error: 'License number must be 60 characters or fewer' }, { status: 400 })
    }
    update.license_number = body.licenseNumber.trim() || null
  }
  if (body.insured !== undefined) {
    if (typeof body.insured !== 'boolean') {
      return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
    }
    update.insured = body.insured
  }
  if (body.yearsInBusiness !== undefined) {
    if (body.yearsInBusiness !== null && (typeof body.yearsInBusiness !== 'number' || body.yearsInBusiness < 0 || body.yearsInBusiness > 200)) {
      return NextResponse.json({ error: 'Invalid years in business' }, { status: 400 })
    }
    update.years_in_business = body.yearsInBusiness
  }
  if (body.specialties !== undefined) {
    if (!Array.isArray(body.specialties) || body.specialties.some((s) => typeof s !== 'string' || !VALID_SPECIALTIES.includes(s as any))) {
      return NextResponse.json({ error: 'Invalid specialties' }, { status: 400 })
    }
    update.specialties = body.specialties
  }
  if (body.serviceZips !== undefined) {
    if (!Array.isArray(body.serviceZips) || body.serviceZips.some((z) => typeof z !== 'string' || !/^\d{5}$/.test(z))) {
      return NextResponse.json({ error: 'Service zips must be 5-digit codes' }, { status: 400 })
    }
    update.service_zips = body.serviceZips.slice(0, 100)
  }
  if (body.pricingNote !== undefined) {
    if (typeof body.pricingNote !== 'string' || body.pricingNote.length > 120) {
      return NextResponse.json({ error: 'Pricing note must be 120 characters or fewer' }, { status: 400 })
    }
    update.pricing_note = body.pricingNote.trim() || null
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await admin.from('pm_organizations').update(update).eq('id', membership.organizationId)
  if (error) {
    console.error('pm/profile-settings: update failed', error)
    return NextResponse.json({ error: 'Could not save that' }, { status: 500 })
  }

  let slug: string | null = null
  if (body.openToClients) {
    slug = await ensureOrgSlug(admin, membership.organizationId, membership.organizationName)
  }

  return NextResponse.json({ ok: true, slug })
}
