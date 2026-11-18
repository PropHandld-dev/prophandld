import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { canActForOwner } from '@/lib/pm'
import { BILL_MAX_BYTES, sniffBill } from '@/lib/utilityCharges'

export const maxDuration = 30

// POST { path, filename }: confirm a receipt uploaded to the signed slot.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const body = (await request.json().catch(() => ({}))) as { path?: string; filename?: string }
  const { data: row } = await admin.from('ledger_entries').select('id, owner_user_id, property_id').eq('id', id).maybeSingle()
  if (!row || !(await canActForOwner(admin, user.id, row.owner_user_id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const path = body.path || ''
  if (!path.startsWith(`ledger/${row.owner_user_id}/receipt-${row.id}-`) || path.includes('..')) return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })

  const { data: blob } = await admin.storage.from('documents').download(path)
  const reject = async (msg: string) => {
    await admin.storage.from('documents').remove([path]).catch(() => {})
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  if (!blob || blob.size === 0) return reject('The receipt didn’t finish uploading.')
  if (blob.size > BILL_MAX_BYTES) return reject('Receipts must be 20 MB or smaller.')
  const sniffed = sniffBill(new Uint8Array(await blob.slice(0, 16).arrayBuffer()))
  if (!sniffed || !path.endsWith(`.${sniffed.ext}`)) return reject('Use a PDF, JPG or PNG.')

  const filename = (body.filename || '').replace(/[^\w.\- ()]/g, '').slice(0, 120) || `Receipt.${sniffed.ext}`
  if (!row.property_id) {
    // Not tied to a property: keep the file, link by path only.
    const { data: doc } = await admin.from('documents').insert({ uploaded_by: user.id, document_type: 'Receipt', filename, file_url: path, visibility: 'landlord_only' }).select('id').single()
    if (doc) await admin.from('ledger_entries').update({ document_id: doc.id }).eq('id', id)
    return NextResponse.json({ ok: !!doc })
  }
  const { data: doc, error } = await admin
    .from('documents')
    .insert({ property_id: row.property_id, uploaded_by: user.id, document_type: 'Receipt', filename, file_url: path, visibility: 'landlord_only' })
    .select('id')
    .single()
  if (error || !doc) return reject('Could not save the receipt.')
  await admin.from('ledger_entries').update({ document_id: doc.id }).eq('id', id)
  return NextResponse.json({ ok: true })
}
