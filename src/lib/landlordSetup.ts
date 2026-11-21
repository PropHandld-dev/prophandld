import { supabase } from '@/lib/supabase'
import { geocodeZip } from '@/lib/geocode'
import { isValidZip, checkAddressOnServer } from '@/lib/zipValidation'
import { toE164 } from '@/lib/phoneFormat'
import { t, type Lang } from '@/lib/i18n'
import type { ContactMode } from '@/components/ContactInviteInput'

// The two writes every landlord makes when they start: add a property (with
// its units), and link or invite a tenant. Shared by the full forms
// (properties/new, units/[unitId]/tenancy/new) and the one-question-at-a-
// time guided setup (/landlord/setup), so all three run the exact same
// checks: ZIP format, server address check, duplicate-address warning,
// the co-owner -> primary owner rule, and the "lease start is required"
// rule that keeps an invite from becoming unlinkable.

export type NewProperty = {
  address: string
  city: string
  state: string
  zip: string
  propertyType: string
  numUnits: number
  geo: { lat: number; lng: number } | null
}

export async function createOwnProperty(
  p: NewProperty,
  lang: Lang,
  confirmOtherOwner: () => Promise<boolean>,
): Promise<{ propertyId: string; unitIds: { id: string; unit_number: string }[] } | { error: string } | { cancelled: true }> {
  // Caught live by an external audit (SEC-02): "QA-INVALID-ZIP" saved
  // straight to the properties table with no format check at all.
  if (p.zip && !isValidZip(p.zip)) return { error: t('invalidZipFormat', lang) }
  const addressCheck = await checkAddressOnServer({ city: p.city, state: p.state, zip: p.zip })
  if (addressCheck.error) return { error: addressCheck.error }
  const state = addressCheck.state

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: t('notAuthenticatedColon', lang) }

  // Checked server-side since RLS only shows this landlord's own rows —
  // the same address under a *different* landlord needs a service-role
  // check. See check-duplicate-address/route.ts.
  const dupRes = await fetch('/api/landlord/properties/check-duplicate-address', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: p.address, city: p.city, state }),
  })
  const dup = await dupRes.json().catch(() => ({}))
  if (dup.ownedByMe) return { error: t('alreadyHavePropertyAddress', lang) }
  if (dup.ownedByOther && !(await confirmOtherOwner())) return { cancelled: true }

  // Precise coordinates from Places autocomplete when we have them,
  // otherwise ZIP-based geocoding.
  const geo = p.geo ?? (p.zip ? await geocodeZip(p.zip) : null)

  // A co-owner creating a property attributes it to the PRIMARY they
  // co-manage for, so the portfolio stays single-owned for billing/payouts.
  const { data: effectiveOwnerId } = await supabase.rpc('primary_landlord_id')

  const { data: property, error: propertyError } = await supabase
    .from('properties')
    .insert({
      owner_user_id: effectiveOwnerId ?? user.id,
      address: p.address,
      city: p.city,
      state,
      zip: p.zip,
      property_type: p.propertyType,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
    })
    .select('id')
    .single()
  if (propertyError || !property) {
    console.error('Error creating property:', propertyError)
    return { error: t('errorCreatingProperty', lang) }
  }

  const { error: roleError } = await supabase
    .from('property_roles')
    .insert({ user_id: user.id, property_id: property.id, role: 'landlord', granted_by: user.id })
  if (roleError) {
    console.error('Error setting property role:', roleError)
    return { error: t('errorSettingPropertyRole', lang) }
  }

  let unitIds: { id: string; unit_number: string }[] = []
  if (p.numUnits > 0) {
    // Every display site already prepends "Unit " — storing "Unit 1" here
    // made them all read "Unit Unit 1".
    const rows = Array.from({ length: p.numUnits }, (_, i) => ({
      property_id: property.id,
      unit_number: p.numUnits === 1 ? 'Main' : `${i + 1}`,
    }))
    const { data: units, error: unitsError } = await supabase.from('units').insert(rows).select('id, unit_number')
    if (unitsError) {
      console.error('Error creating units:', unitsError)
      return { error: t('errorCreatingUnits', lang) }
    }
    unitIds = (units || []).sort((a, b) => a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true }))
  }

  fetch('/api/stripe/subscription/sync', { method: 'POST' }).catch(() => {})
  return { propertyId: property.id, unitIds }
}

export type TenantTerms = {
  rent_amount: string
  rent_due_day: string
  lease_start: string
  lease_end: string
  security_deposit?: string
  escalation_percent?: string
  escalation_frequency_months?: string
  occupants?: string
  pets?: string
  lease_notes?: string
  first_month_proration?: 'prorate' | 'full'
}

const termsRow = (f: TenantTerms) => ({
  rent_amount: f.rent_amount ? parseFloat(f.rent_amount) : null,
  rent_due_day: f.rent_due_day ? parseInt(f.rent_due_day) : 1,
  lease_start: f.lease_start || null,
  lease_end: f.lease_end || null,
  security_deposit: f.security_deposit ? parseFloat(f.security_deposit) : null,
  escalation_percent: f.escalation_percent ? parseFloat(f.escalation_percent) : null,
  escalation_frequency_months: f.escalation_frequency_months ? parseInt(f.escalation_frequency_months) : null,
  occupants: f.occupants ? parseInt(f.occupants) : null,
  pets: f.pets?.trim() || null,
  lease_notes: f.lease_notes?.trim() || null,
  first_month_proration: f.first_month_proration === 'full' ? 'full' : 'prorate',
})

// Links an existing renter account straight away, otherwise sends an
// invite by email or text that links automatically when they sign up.
export async function linkOrInviteTenant(
  unitId: string,
  contactMode: ContactMode,
  contact: string,
  terms: TenantTerms,
  lang: Lang,
): Promise<{ result: 'linked' | 'invited' } | { error: string }> {
  const trimmed = contact.trim()
  // An invite with no recipient used to save as a permanent "pending" row.
  if (!trimmed) return { error: contactMode === 'email' ? t('enterRenterEmailError', lang) : t('enterRenterPhoneError', lang) }
  // tenancies.lease_start is required: without it an invite could never link.
  if (!terms.lease_start) return { error: t('enterLeaseStartError', lang) }

  // Lowercased so it matches however the tenant capitalizes it at signup.
  const renterEmail = contactMode === 'email' ? trimmed.toLowerCase() : null

  // role_input 'renter': an email that belongs to one of the landlord's
  // own other-role accounts must get an invite, not be linked as tenant.
  const { data: renterId, error: renterError } = renterEmail
    ? await supabase.rpc('get_user_id_by_email', { email_input: renterEmail, role_input: 'renter' })
    : await supabase.rpc('get_user_id_by_phone', { phone_input: trimmed, role_input: 'renter' })

  if (!renterError && renterId) {
    const { error } = await supabase.from('tenancies').insert({ unit_id: unitId, renter_user_id: renterId, ...termsRow(terms) })
    if (error) {
      console.error('Error creating tenancy:', error)
      return { error: t('errorCreatingTenancyColon', lang) }
    }
    return { result: 'linked' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: t('notAuthenticatedPeriod', lang) }

  // Replace any existing pending invite for this unit rather than duplicating.
  await supabase.from('tenancy_invites').update({ status: 'cancelled' }).eq('unit_id', unitId).eq('status', 'pending')

  const { data: invite, error: inviteError } = await supabase
    .from('tenancy_invites')
    .insert({
      unit_id: unitId,
      landlord_user_id: user.id,
      ...(contactMode === 'email' ? { renter_email: renterEmail } : { renter_phone: toE164(trimmed) }),
      ...termsRow(terms),
    })
    .select('id')
    .single()
  if (inviteError || !invite) {
    console.error('Error creating invite:', inviteError)
    return { error: t('couldNotSendInvite', lang) }
  }

  fetch('/api/invite-renter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteId: invite.id }),
    keepalive: true,
  }).catch((err) => console.error('invite-renter fetch failed:', err))

  return { result: 'invited' }
}
