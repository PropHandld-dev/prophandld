import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getActionableOwnerIdsAdmin } from '@/lib/pm'
import { BILL_MAX_BYTES, sniffBill, utilityName, loadUtilityCharges } from '@/lib/utilityCharges'

export const maxDuration = 30

// POST { chargeId, path, filename }: called after the browser uploaded a
// bill to the signed slot from PUT ../utilities. Checks the stored file is
// really a PDF/JPG/PNG, then links it to the bill so the tenant can open it.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { chargeId?: string; path?: string; filename?: string } | null
  if (!body?.chargeId || !body.path) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const { data: charge } = await admin
    .from('rent_utility_charges')
    .select('id, kind, label, document_id, rent_payments(id, tenancies(unit_id, units(property_id, properties(owner_user_id))))')
    .eq('id', body.chargeId)
    .eq('rent_payment_id', id)
    .maybeSingle()
  const unitId = (charge as any)?.rent_payments?.tenancies?.unit_id
  const propertyId = (charge as any)?.rent_payments?.tenancies?.units?.property_id
  const ownerId = (charge as any)?.rent_payments?.tenancies?.units?.properties?.owner_user_id
  if (!charge || !ownerId || !(await getActionableOwnerIdsAdmin(admin, user.id)).includes(ownerId)) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
  }

  // Only the exact slot PUT issued for this bill (property folder + bill id).
  const expectedPrefix = `${propertyId}/utility-${charge.id}-`
  if (!body.path.startsWith(expectedPrefix) || body.path.includes('..') || body.path.length > 200) {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })
  }

  const { data: blob, error: downloadError } = await admin.storage.from('documents').download(body.path)
  if (downloadError || !blob) return NextResponse.json({ error: "The file didn't finish uploading. Try again." }, { status: 400 })
  const reject = async (message: string) => {
    await admin.storage.from('documents').remove([body.path!]).catch(() => {})
    return NextResponse.json({ error: message }, { status: 400 })
  }
  if (blob.size === 0) return reject('That file is empty.')
  if (blob.size > BILL_MAX_BYTES) return reject('Bills must be 20 MB or smaller.')
  const sniffed = sniffBill(new Uint8Array(await blob.slice(0, 16).arrayBuffer()))
  if (!sniffed) return reject('Use a PDF, JPG or PNG of the bill.')
  if (!body.path.endsWith(`.${sniffed.ext}`)) return reject("That file's type doesn't match its name. Use a PDF, JPG or PNG of the bill.")

  const name = utilityName(charge as any)
  const rawName = typeof body.filename === 'string' ? body.filename.replace(/[^\w.\- ()]/g, '').slice(0, 120) : ''
  const filename = rawName || `${name} bill.${sniffed.ext}`
  const { data: doc, error: docError } = await admin
    .from('documents')
    .insert({
      property_id: propertyId,
      unit_id: unitId,
      uploaded_by: user.id,
      document_type: `${name} Bill`,
      filename,
      file_url: body.path,
      visibility: 'shared',
    })
    .select('id')
    .single()
  if (docError || !doc) {
    console.error('rent-payment/utilities/attach: document insert failed', docError)
    return reject('Could not save the bill. Try again.')
  }
  const { error: linkError } = await admin.from('rent_utility_charges').update({ document_id: doc.id }).eq('id', charge.id)
  if (linkError) {
    console.error('rent-payment/utilities/attach: link failed', linkError)
    await admin.from('documents').delete().eq('id', doc.id)
    return reject('Could not attach the bill. Try again.')
  }

  const charges = await loadUtilityCharges(admin, [id]).catch(() => [])
  return NextResponse.json({ ok: true, charges })
}
