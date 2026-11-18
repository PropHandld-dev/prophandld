import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { canActForOwner } from '@/lib/pm'

export const maxDuration = 15

const CATEGORIES = {
  in: ['rent', 'deposit', 'other_income'],
  out: ['repair', 'utilities', 'insurance', 'tax', 'mortgage', 'hoa', 'supplies', 'management', 'legal', 'other'],
} as const

// POST { ownerId?, propertyId?, date, direction, category, amount, description?, vendor?, receipt?: 'pdf'|'jpg'|'png' }
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getSupabaseAdmin()
  const b = (await request.json().catch(() => ({}))) as Record<string, any>

  let ownerId: string = typeof b.ownerId === 'string' && b.ownerId ? b.ownerId : user.id
  let propertyId: string | null = typeof b.propertyId === 'string' && b.propertyId ? b.propertyId : null
  if (propertyId) {
    const { data: prop } = await admin.from('properties').select('owner_user_id').eq('id', propertyId).maybeSingle()
    if (!prop) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    ownerId = prop.owner_user_id
  }
  if (!(await canActForOwner(admin, user.id, ownerId))) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const direction = b.direction === 'in' ? 'in' : b.direction === 'out' ? 'out' : null
  if (!direction) return NextResponse.json({ error: 'Choose money in or money out' }, { status: 400 })
  if (!(CATEGORIES[direction] as readonly string[]).includes(b.category)) return NextResponse.json({ error: 'Choose a category' }, { status: 400 })
  const amount = Number(b.amount)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return NextResponse.json({ error: 'Enter an amount' }, { status: 400 })
  const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && !Number.isNaN(Date.parse(b.date)) ? b.date : null
  if (!date) return NextResponse.json({ error: 'Enter a date' }, { status: 400 })
  const description = typeof b.description === 'string' ? b.description.trim().slice(0, 300) || null : null
  const vendor = typeof b.vendor === 'string' ? b.vendor.trim().slice(0, 120) || null : null

  const { data: row, error } = await admin
    .from('ledger_entries')
    .insert({ owner_user_id: ownerId, property_id: propertyId, entry_date: date, direction, category: b.category, amount: Math.round(amount * 100) / 100, description, vendor, created_by: user.id })
    .select('id')
    .single()
  if (error || !row) {
    console.error('records/entries: insert failed', error)
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
  }

  let upload: { path: string; token: string } | null = null
  if (['pdf', 'jpg', 'png'].includes(b.receipt)) {
    const path = `ledger/${ownerId}/receipt-${row.id}-${crypto.randomUUID()}.${b.receipt}`
    const { data } = await admin.storage.from('documents').createSignedUploadUrl(path)
    if (data) upload = { path: data.path, token: data.token }
  }
  return NextResponse.json({ ok: true, id: row.id, upload })
}
