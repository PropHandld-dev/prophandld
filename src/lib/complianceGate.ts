// Under Philadelphia's Safe Healthy Homes legislation (Bill 250329-AA),
// a landlord with a lapsed rental license past its 15-day renewal grace
// period legally cannot collect rent at all. Nothing in autopay or the
// late-fee cron checked this before — this is the server-side check both
// use to pause rather than collect rent they're not legally allowed to.
//
// Checks the Rental License item specifically, not any compliance item —
// a lapsed fire-extinguisher inspection doesn't carry the same legal
// rent-collection consequence, so it isn't treated as blocking here.
const RENTAL_LICENSE_GRACE_DAYS = 15

export async function hasBlockingComplianceIssue(supabaseAdmin: any, propertyId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('compliance_items')
    .select('expiry_date')
    .eq('property_id', propertyId)
    .eq('item_type', 'Rental License')
    .order('expiry_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data?.expiry_date) return false

  const cutoff = new Date(data.expiry_date + 'T00:00:00')
  cutoff.setDate(cutoff.getDate() + RENTAL_LICENSE_GRACE_DAYS)
  return new Date() > cutoff
}
