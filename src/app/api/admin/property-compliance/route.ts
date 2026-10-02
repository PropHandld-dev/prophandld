import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { getComplianceStatus } from '@/lib/complianceStatus'

// The property-compliance equivalent of /api/admin/contractor-compliance —
// nothing today surfaces compliance_items across properties to anyone but
// the owning landlord, who only sees it if they happen to open that one
// property's compliance page. Grouped by property (items are property-
// scoped, not landlord-scoped — one landlord can own several).
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const admin = getSupabaseAdmin()

  const { data: items, error: itemsError } = await admin
    .from('compliance_items')
    .select('id, property_id, item_type, expiry_date, reminder_days')
  if (itemsError) {
    console.error('property-compliance: items query failed', itemsError)
    return NextResponse.json({ error: 'Could not load compliance items' }, { status: 500 })
  }
  if (!items || items.length === 0) {
    return NextResponse.json({ properties: [] })
  }

  const propertyIds = Array.from(new Set(items.map((i) => i.property_id)))
  const { data: properties, error: propertiesError } = await admin
    .from('properties')
    .select('id, address, city, owner_user_id')
    .in('id', propertyIds)
  if (propertiesError) {
    console.error('property-compliance: properties query failed', propertiesError)
    return NextResponse.json({ error: 'Could not load properties' }, { status: 500 })
  }

  const ownerIds = Array.from(new Set((properties || []).map((p) => p.owner_user_id).filter(Boolean)))
  const { data: owners, error: ownersError } = ownerIds.length
    ? await admin.from('users').select('id, full_name, email, preferred_language').in('id', ownerIds)
    : { data: [], error: null }
  if (ownersError) {
    console.error('property-compliance: owners query failed', ownersError)
    return NextResponse.json({ error: 'Could not load landlords' }, { status: 500 })
  }
  const ownerById = new Map((owners || []).map((o) => [o.id, o]))
  const propertyById = new Map((properties || []).map((p) => [p.id, p]))

  const itemsByProperty = new Map<string, typeof items>()
  for (const item of items) {
    const list = itemsByProperty.get(item.property_id) || []
    list.push(item)
    itemsByProperty.set(item.property_id, list)
  }

  const result = Array.from(itemsByProperty.entries()).map(([propertyId, propItems]) => {
    const property = propertyById.get(propertyId)
    const owner = property?.owner_user_id ? ownerById.get(property.owner_user_id) : null

    const enrichedItems = propItems.map((item) => {
      const { key, daysUntil } = getComplianceStatus(item.expiry_date, item.reminder_days)
      return { id: item.id, name: item.item_type, status: key, daysUntil, expiryDate: item.expiry_date }
    })

    const expired = enrichedItems.filter((i) => i.status === 'expired')
    const expiringSoon = enrichedItems.filter((i) => i.status === 'expiring_soon')
    const current = enrichedItems.filter((i) => i.status === 'current')

    return {
      propertyId,
      address: property?.address || 'Unknown property',
      city: property?.city || null,
      ownerId: property?.owner_user_id || null,
      ownerName: owner?.full_name || 'Unknown landlord',
      ownerEmail: owner?.email || null,
      preferredLanguage: owner?.preferred_language || 'en',
      items: enrichedItems,
      expiredCount: expired.length,
      expiringSoonCount: expiringSoon.length,
      currentCount: current.length,
      needsAttention: expired.length > 0 || expiringSoon.length > 0,
    }
  })

  result.sort((a, b) => (b.expiredCount + b.expiringSoonCount) - (a.expiredCount + a.expiringSoonCount))

  return NextResponse.json({ properties: result })
}
