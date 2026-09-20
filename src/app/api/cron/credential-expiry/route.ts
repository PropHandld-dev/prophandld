import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requirementById } from '@/lib/credentialRequirements'
import { sendCredentialExpiryEmail, type CredentialExpiryItem } from '@/lib/email'

export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000
const PAGE = 500
const CHUNK = 100

// Runs daily (see vercel.json). Emails each contractor once per stage as a
// credential approaches expiry: within 30 days, within 7 days, and after it
// expires. `expiry_reminder_stage` records the last stage sent, so a repeat
// or missed run is harmless, and it resets to 0 when the contractor uploads
// a renewal. A contractor with several credentials due gets one email.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizon = new Date(today.getTime() + 30 * DAY_MS).toISOString().slice(0, 10)

  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('contractor_credentials')
      .select('id, contractor_user_id, requirement_id, expiry, expiry_reminder_stage')
      .in('status', ['verified', 'pending'])
      .not('expiry', 'is', null)
      .lte('expiry', horizon)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('cron/credential-expiry: query failed', error)
      return NextResponse.json({ error: 'Could not load credentials' }, { status: 500 })
    }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }

  const due = new Map<string, { id: string; stage: 1 | 2 | 3; item: CredentialExpiryItem }[]>()
  for (const row of rows) {
    const days = Math.round((new Date(row.expiry + 'T00:00:00').getTime() - today.getTime()) / DAY_MS)
    const stage = (days < 0 ? 3 : days <= 7 ? 2 : 1) as 1 | 2 | 3
    if (stage <= (row.expiry_reminder_stage || 0)) continue
    const name = requirementById(row.requirement_id)?.name
    if (!name) continue
    const list = due.get(row.contractor_user_id) || []
    list.push({ id: row.id, stage, item: { name, expiry: row.expiry, stage } })
    due.set(row.contractor_user_id, list)
  }

  const contractorIds = Array.from(due.keys())
  const people = new Map<string, { email: string | null; full_name: string | null }>()
  for (let i = 0; i < contractorIds.length; i += CHUNK) {
    const { data } = await admin.from('users').select('id, email, full_name').in('id', contractorIds.slice(i, i + CHUNK))
    for (const u of data || []) people.set(u.id, u)
  }

  let emailsSent = 0
  for (const [contractorId, entries] of due) {
    const person = people.get(contractorId)
    if (!person?.email) continue
    const result = await sendCredentialExpiryEmail({
      to: person.email,
      contractorName: person.full_name || 'there',
      items: entries.map((e) => e.item),
    })
    if (!result.ok) continue
    emailsSent++
    for (const e of entries) {
      await admin.from('contractor_credentials').update({ expiry_reminder_stage: e.stage }).eq('id', e.id)
    }
  }

  return NextResponse.json({ ok: true, credentialsChecked: rows.length, contractorsEmailed: emailsSent })
}
