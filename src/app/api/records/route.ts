import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getActionableOwnerIdsAdmin, getPmMembership } from '@/lib/pm'

export const maxDuration = 30

export type LedgerEntry = {
  id: string
  type: 'rent' | 'contractor' | 'fee' | 'manual'
  direction: 'in' | 'out'
  date: string
  amount: number
  title: string
  detail: string | null
  counterparty: string | null
  method: string | null
  ownerId: string
  ownerName: string
  propertyId: string | null
  propertyLabel: string | null
  unitLabel: string | null
  receiptUrl: string | null
  photos: string[]
  jobId: string | null
  category: string | null
}

const isUuid = (v: string | null) => !!v && /^[0-9a-f-]{36}$/i.test(v)

// GET ?year=2026&owner=&property= : every money movement for the year
// across the caller's own properties, co-owned ones, and (for PMs with
// financial access) their clients' — rent in, contractor payments and
// management fees out, plus hand-entered income and expenses.
const cents2 = (v: unknown) => Math.round(Number(v || 0) * 100) / 100

export async function GET(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user.app_metadata?.role !== 'landlord') return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const admin = getSupabaseAdmin()

  const params = request.nextUrl.searchParams
  const year = Number(params.get('year')) || new Date().getFullYear()
  if (year < 2000 || year > 2100) return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  const start = `${year}-01-01`
  const end = `${year + 1}-01-01`

  let ownerIds = await getActionableOwnerIdsAdmin(admin, user.id)
  const membership = await getPmMembership(admin, user.id)
  if (membership && !membership.canViewFinancials) ownerIds = ownerIds.filter((id) => id === user.id)
  const ownerParam = params.get('owner')
  if (isUuid(ownerParam)) ownerIds = ownerIds.filter((id) => id === ownerParam)
  const propertyParam = params.get('property')

  const { data: owners } = ownerIds.length ? await admin.from('users').select('id, full_name').in('id', ownerIds) : { data: [] }
  const ownerName = new Map((owners || []).map((o: any) => [o.id, o.full_name || 'Owner']))

  let propQuery = admin.from('properties').select('id, address, city, owner_user_id, archived').in('owner_user_id', ownerIds.length ? ownerIds : ['00000000-0000-0000-0000-000000000000'])
  if (isUuid(propertyParam)) propQuery = propQuery.eq('id', propertyParam!)
  const { data: properties } = await propQuery
  const props = properties || []
  const propById = new Map(props.map((p: any) => [p.id, p]))
  const propertyIds = props.map((p: any) => p.id)

  const { data: units } = propertyIds.length ? await admin.from('units').select('id, unit_number, property_id').in('property_id', propertyIds) : { data: [] }
  const unitById = new Map((units || []).map((u: any) => [u.id, u]))
  const unitIds = (units || []).map((u: any) => u.id)
  const unitLabel = (unitId: string) => {
    const u: any = unitById.get(unitId)
    return u && u.unit_number && u.unit_number !== 'Main' ? `Unit ${u.unit_number}` : null
  }

  const [{ data: tenancies }, { data: jobs }] = await Promise.all([
    unitIds.length ? admin.from('tenancies').select('id, unit_id, renter_user_id').in('unit_id', unitIds) : Promise.resolve({ data: [] as any[] }),
    unitIds.length ? admin.from('jobs').select('id, unit_id, category, description').in('unit_id', unitIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const tenancyById = new Map((tenancies || []).map((t: any) => [t.id, t]))
  const jobById = new Map((jobs || []).map((j: any) => [j.id, j]))
  const tenancyIds = (tenancies || []).map((t: any) => t.id)
  const jobIds = (jobs || []).map((j: any) => j.id)

  const [{ data: rents }, { data: bids }, { data: fees }, { data: manual }] = await Promise.all([
    tenancyIds.length
      ? admin.from('rent_payments').select('id, tenancy_id, month, paid_date, actual_amount, utilities_amount, payment_method, paid_to').in('tenancy_id', tenancyIds).gte('paid_date', start).lt('paid_date', end).gt('actual_amount', 0)
      : Promise.resolve({ data: [] as any[] }),
    jobIds.length
      ? admin.from('bids').select('id, job_id, amount, paid_at, payment_method, contractor_user_id').in('job_id', jobIds).eq('payment_status', 'paid').gte('paid_at', start).lt('paid_at', end)
      : Promise.resolve({ data: [] as any[] }),
    ownerIds.length
      ? admin.from('pm_fee_payments').select('id, amount, paid_at, owner_user_id, organization_id, pm_organizations(name)').in('owner_user_id', ownerIds).eq('status', 'paid').gte('paid_at', start).lt('paid_at', end)
      : Promise.resolve({ data: [] as any[] }),
    ownerIds.length
      ? admin.from('ledger_entries').select('id, owner_user_id, property_id, entry_date, direction, category, amount, description, vendor, documents(file_url)').in('owner_user_id', ownerIds).gte('entry_date', start).lt('entry_date', end)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const personIds = new Set<string>()
  for (const r of rents || []) { const t: any = tenancyById.get(r.tenancy_id); if (t?.renter_user_id) personIds.add(t.renter_user_id) }
  for (const b of bids || []) if (b.contractor_user_id) personIds.add(b.contractor_user_id)
  const { data: people } = personIds.size ? await admin.from('users').select('id, full_name').in('id', Array.from(personIds)) : { data: [] }
  const personName = new Map((people || []).map((p: any) => [p.id, p.full_name || null]))

  // Completion photos and receipts for paid jobs (a few per job).
  const paidJobIds = Array.from(new Set((bids || []).map((b: any) => b.job_id)))
  const { data: photos } = paidJobIds.length
    ? await admin.from('job_photos').select('job_id, photo_url, stage').in('job_id', paidJobIds).in('stage', ['after', 'receipt']).order('created_at', { ascending: false })
    : { data: [] }
  const manualPaths = (manual || []).map((m: any) => m.documents?.file_url).filter(Boolean)
  const photoPaths = (photos || []).filter((p: any) => !/\.(mp4|mov|webm|m4v|avi)$/i.test(p.photo_url)).map((p: any) => p.photo_url)
  const signed = new Map<string, string>()
  if (photoPaths.length) {
    const { data } = await admin.storage.from('job-photos').createSignedUrls(photoPaths.slice(0, 200), 3600)
    for (const s of data || []) if (s.path && s.signedUrl) signed.set(`job:${s.path}`, s.signedUrl)
  }
  if (manualPaths.length) {
    const { data } = await admin.storage.from('documents').createSignedUrls(manualPaths, 3600)
    for (const s of data || []) if (s.path && s.signedUrl) signed.set(`doc:${s.path}`, s.signedUrl)
  }
  const photosByJob = new Map<string, string[]>()
  for (const p of photos || []) {
    const url = signed.get(`job:${p.photo_url}`)
    if (!url) continue
    const list = photosByJob.get(p.job_id) || []
    if (list.length < 4) list.push(url)
    photosByJob.set(p.job_id, list)
  }

  const entries: LedgerEntry[] = []
  for (const r of rents || []) {
    const t: any = tenancyById.get(r.tenancy_id)
    const u: any = t && unitById.get(t.unit_id)
    const p: any = u && propById.get(u.property_id)
    if (!p) continue
    const utilities = Number(r.utilities_amount || 0)
    const monthLabel = new Date(r.month + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    entries.push({
      id: `rent-${r.id}`,
      type: 'rent',
      direction: 'in',
      date: r.paid_date,
      amount: cents2(r.actual_amount),
      title: `${monthLabel} rent`,
      detail: utilities > 0 ? `Includes $${utilities.toFixed(2)} utilities` : null,
      counterparty: personName.get(t.renter_user_id) || 'Tenant',
      method: r.payment_method === 'bank' ? 'Bank transfer' : r.payment_method === 'card' ? 'Debit card' : r.payment_method ? String(r.payment_method).replace(/^./, (c: string) => c.toUpperCase()) : 'Recorded by hand',
      ownerId: p.owner_user_id,
      ownerName: ownerName.get(p.owner_user_id) || 'Owner',
      propertyId: p.id,
      propertyLabel: p.address,
      unitLabel: unitLabel(u.id),
      receiptUrl: `/receipts/rent/${r.id}`,
      photos: [],
      jobId: null,
      category: r.paid_to === 'pm' ? 'Collected by your property manager' : null,
    })
  }
  for (const b of bids || []) {
    const j: any = jobById.get(b.job_id)
    const u: any = j && unitById.get(j.unit_id)
    const p: any = u && propById.get(u.property_id)
    if (!p) continue
    entries.push({
      id: `job-${b.id}`,
      type: 'contractor',
      direction: 'out',
      date: String(b.paid_at).slice(0, 10),
      amount: cents2(b.amount),
      title: j.category || 'Repair',
      detail: j.description ? String(j.description).slice(0, 280) : null,
      counterparty: personName.get(b.contractor_user_id) || 'Contractor',
      method: b.payment_method === 'card' ? 'Card' : b.payment_method === 'bank' ? 'Bank transfer' : null,
      ownerId: p.owner_user_id,
      ownerName: ownerName.get(p.owner_user_id) || 'Owner',
      propertyId: p.id,
      propertyLabel: p.address,
      unitLabel: unitLabel(u.id),
      receiptUrl: `/receipts/job/${b.id}`,
      photos: photosByJob.get(b.job_id) || [],
      jobId: b.job_id,
      category: 'Repairs and maintenance',
    })
  }
  if (!isUuid(propertyParam)) {
    for (const f of fees || []) {
      entries.push({
        id: `fee-${f.id}`,
        type: 'fee',
        direction: 'out',
        date: String(f.paid_at).slice(0, 10),
        amount: cents2(f.amount),
        title: 'Management fee',
        detail: null,
        counterparty: (f as any).pm_organizations?.name || 'Property manager',
        method: 'Saved card',
        ownerId: f.owner_user_id,
        ownerName: ownerName.get(f.owner_user_id) || 'Owner',
        propertyId: null,
        propertyLabel: null,
        unitLabel: null,
        receiptUrl: null,
        photos: [],
        jobId: null,
        category: 'Management fees',
      })
    }
  }
  for (const m of manual || []) {
    if (isUuid(propertyParam) && m.property_id !== propertyParam) continue
    const p: any = m.property_id ? propById.get(m.property_id) : null
    entries.push({
      id: `manual-${m.id}`,
      type: 'manual',
      direction: m.direction,
      date: m.entry_date,
      amount: cents2(m.amount),
      title: m.description || m.category,
      detail: null,
      counterparty: m.vendor,
      method: 'Entered by hand',
      ownerId: m.owner_user_id,
      ownerName: ownerName.get(m.owner_user_id) || 'Owner',
      propertyId: m.property_id,
      propertyLabel: p?.address || null,
      unitLabel: null,
      receiptUrl: (m as any).documents?.file_url ? signed.get(`doc:${(m as any).documents.file_url}`) || null : null,
      photos: [],
      jobId: null,
      category: m.category,
    })
  }
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  // Summed in whole cents so the headline totals always equal the rows
  // (QA REPORT-03: the CSV header was a cent off its own rows).
  const income = entries.filter((e) => e.direction === 'in').reduce((t, e) => t + Math.round(e.amount * 100), 0) / 100
  const expenses = entries.filter((e) => e.direction === 'out').reduce((t, e) => t + Math.round(e.amount * 100), 0) / 100
  const byProperty = new Map<string, { propertyId: string; label: string; income: number; expenses: number }>()
  for (const e of entries) {
    const key = e.propertyId || 'none'
    const row = byProperty.get(key) || { propertyId: key, label: e.propertyLabel || 'Not tied to a property', income: 0, expenses: 0 }
    if (e.direction === 'in') row.income += e.amount
    else row.expenses += e.amount
    byProperty.set(key, row)
  }

  return NextResponse.json({
    year,
    entries,
    totals: { income, expenses, net: (Math.round(income * 100) - Math.round(expenses * 100)) / 100 },
    byProperty: Array.from(byProperty.values()).map((r) => ({ ...r, income: Math.round(r.income * 100) / 100, expenses: Math.round(r.expenses * 100) / 100 })).sort((a, b) => b.income + b.expenses - (a.income + a.expenses)),
    owners: (owners || []).map((o: any) => ({ id: o.id, name: o.id === user.id ? 'You' : o.full_name || 'Owner' })),
    properties: props.map((p: any) => ({ id: p.id, label: p.address, ownerId: p.owner_user_id })),
  })
}
