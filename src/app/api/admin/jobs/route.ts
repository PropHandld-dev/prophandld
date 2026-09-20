import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requirementById } from '@/lib/credentialRequirements'

const DAY_MS = 24 * 60 * 60 * 1000
const CHUNK = 100

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

type Flag = { key: string; label: string; severity: 'red' | 'yellow' | 'info' }

// Everything an admin needs about each job in one place: who's involved,
// what it costs, where it stands, and what looks stuck. Service-role query
// (like /api/admin/users) because admins aren't participants on any job, so
// row-level security would hide the related people, bids and disputes.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !user.email?.endsWith('@prophandld.com')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const admin = getSupabaseAdmin()

  const { data: jobs, error } = await admin
    .from('jobs')
    .select('id, category, description, status, is_emergency, created_at, unit_id, proposed_date, proposed_window, proposed_time, schedule_confirmed, contractor_completed_at, landlord_approved_at, units(unit_number, properties(address, city, state, zip, owner_user_id))')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('admin/jobs: error loading jobs', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const jobIds = (jobs || []).map((j) => j.id)
  const unitIds = Array.from(new Set((jobs || []).map((j) => j.unit_id).filter(Boolean)))

  const bids: any[] = []
  const disputes: any[] = []
  const tenancies: any[] = []
  for (const ids of chunk(jobIds, CHUNK)) {
    const [{ data: b }, { data: d }] = await Promise.all([
      admin.from('bids').select('job_id, contractor_user_id, status, amount, payment_status, selected_at').in('job_id', ids),
      admin.from('disputes').select('job_id, status').in('job_id', ids),
    ])
    bids.push(...(b || []))
    disputes.push(...(d || []))
  }
  for (const ids of chunk(unitIds, CHUNK)) {
    const { data } = await admin.from('tenancies').select('unit_id, renter_user_id').in('unit_id', ids).eq('ended', false)
    tenancies.push(...(data || []))
  }

  const contractorIds = Array.from(new Set(bids.filter((b) => b.status === 'accepted').map((b) => b.contractor_user_id)))
  const credentials: any[] = []
  for (const ids of chunk(contractorIds, CHUNK)) {
    const { data } = await admin
      .from('contractor_credentials')
      .select('contractor_user_id, requirement_id, expiry')
      .eq('status', 'verified')
      .in('contractor_user_id', ids)
    credentials.push(...(data || []))
  }

  const personIds = Array.from(new Set([
    ...(jobs || []).map((j) => (j.units as any)?.properties?.owner_user_id),
    ...tenancies.map((t) => t.renter_user_id),
    ...contractorIds,
  ].filter(Boolean)))
  const people = new Map<string, { name: string | null; email: string | null; phone: string | null }>()
  for (const ids of chunk(personIds, CHUNK)) {
    const { data } = await admin.from('users').select('id, full_name, email, phone').in('id', ids)
    for (const u of data || []) people.set(u.id, { name: u.full_name, email: u.email, phone: u.phone })
  }

  const person = (id: string | null | undefined) => (id ? { id, ...(people.get(id) || { name: null, email: null, phone: null }) } : null)
  const now = Date.now()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const result = (jobs || []).map((j) => {
    const unit = j.units as any
    const property = unit?.properties
    const jobBids = bids.filter((b) => b.job_id === j.id)
    const accepted = jobBids.find((b) => b.status === 'accepted') || null
    const pendingBids = jobBids.filter((b) => b.status === 'pending').length
    const tenancy = tenancies.find((t) => t.unit_id === j.unit_id)
    const dispute = disputes.find((d) => d.job_id === j.id && d.status === 'open')
    const ageDays = (now - new Date(j.created_at).getTime()) / DAY_MS

    const badges = accepted
      ? credentials
          .filter((c) => c.contractor_user_id === accepted.contractor_user_id)
          .filter((c) => !c.expiry || new Date(c.expiry + 'T00:00:00').getTime() >= now)
          .map((c) => requirementById(c.requirement_id)?.badge)
          .filter(Boolean)
      : []

    const flags: Flag[] = []
    if (dispute) flags.push({ key: 'dispute', label: 'Open dispute', severity: 'red' })
    if (j.is_emergency && ['pending_approval', 'approved', 'bidding'].includes(j.status) && ageDays > 1) {
      flags.push({ key: 'emergency', label: 'Emergency still unassigned', severity: 'red' })
    }
    if (j.status === 'bidding' && pendingBids === 0 && ageDays > 3) {
      flags.push({ key: 'no_bids', label: 'No bids after 3+ days', severity: 'yellow' })
    }
    if (j.status === 'bidding' && pendingBids > 0 && ageDays > 2) {
      flags.push({ key: 'bids_waiting', label: `${pendingBids} bid${pendingBids === 1 ? '' : 's'} waiting on landlord`, severity: 'yellow' })
    }
    if (j.status === 'bid_selected' && accepted?.selected_at && now - new Date(accepted.selected_at).getTime() > 3 * DAY_MS) {
      flags.push({ key: 'no_schedule', label: 'Contractor picked 3+ days ago, no confirmed time', severity: 'yellow' })
    }
    if (['bid_selected', 'scheduled'].includes(j.status) && j.schedule_confirmed && j.proposed_date && new Date(j.proposed_date + 'T00:00:00').getTime() < today.getTime()) {
      flags.push({ key: 'past_date', label: 'Appointment date passed, work not started', severity: 'yellow' })
    }
    if (j.status === 'pending_review' && j.contractor_completed_at && now - new Date(j.contractor_completed_at).getTime() > 2 * DAY_MS) {
      flags.push({ key: 'review_overdue', label: 'Landlord review overdue (auto-approves at 3 days)', severity: 'yellow' })
    }
    if (['completed', 'archived'].includes(j.status) && accepted && accepted.payment_status !== 'paid') {
      flags.push({ key: 'unpaid', label: 'Completed, payment not recorded', severity: 'yellow' })
    }
    if (accepted && badges.length === 0 && !['completed', 'archived'].includes(j.status)) {
      flags.push({ key: 'unverified', label: 'Contractor has no verified credentials', severity: 'info' })
    }

    return {
      id: j.id,
      category: j.category,
      description: j.description,
      status: j.status,
      isEmergency: !!j.is_emergency,
      createdAt: j.created_at,
      address: property?.address || null,
      city: property?.city || null,
      state: property?.state || null,
      zip: property?.zip || null,
      unit: unit?.unit_number || null,
      schedule: { date: j.proposed_date, window: j.proposed_window, time: j.proposed_time, confirmed: !!j.schedule_confirmed },
      completedAt: j.contractor_completed_at,
      approvedAt: j.landlord_approved_at,
      landlord: person(property?.owner_user_id),
      tenant: person(tenancy?.renter_user_id),
      contractor: accepted ? { ...person(accepted.contractor_user_id), badges } : null,
      bidCount: jobBids.length,
      pendingBids,
      acceptedAmount: accepted ? Number(accepted.amount) : null,
      paymentStatus: accepted?.payment_status || null,
      hasOpenDispute: !!dispute,
      flags,
    }
  })

  return NextResponse.json({ jobs: result })
}
