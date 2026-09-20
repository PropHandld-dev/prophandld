import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

const DAY_MS = 24 * 60 * 60 * 1000
const CHUNK = 100
const TIER_PRICES: Record<string, number> = { tier_20: 20, tier_50: 50, tier_80: 80 }

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

type Status = 'succeeded' | 'processing' | 'pending' | 'refunded' | 'failed' | 'manual'

// One feed for every dollar moving through the platform: rent (tenant to
// landlord), job payments (landlord to contractor) and subscriptions
// (landlord to Prophandld). Service-role query — an admin isn't a party to
// any of these rows, so row-level security would hide them.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !user.email?.endsWith('@prophandld.com')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const admin = getSupabaseAdmin()
  const testMode = (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test')
  const stripeBase = testMode ? 'https://dashboard.stripe.com/test' : 'https://dashboard.stripe.com'

  const [rentRes, jobRes, subRes, connectRes] = await Promise.all([
    admin
      .from('rent_payments')
      .select('id, month, expected_amount, actual_amount, paid_date, payment_method, stripe_status, stripe_payment_intent_id, water_amount, late_fee_applied, created_at, tenancies(renter_user_id, units(unit_number, properties(address, city, owner_user_id)))')
      .or('actual_amount.gt.0,stripe_status.not.is.null')
      .order('created_at', { ascending: false })
      .limit(500),
    admin
      .from('bids')
      .select('id, job_id, contractor_user_id, amount, payment_status, paid_at, stripe_payment_intent_id, jobs(category, units(unit_number, properties(address, city, owner_user_id)))')
      .not('payment_status', 'is', null)
      .limit(500),
    admin.from('landlord_subscriptions').select('landlord_user_id, tier, status, updated_at, stripe_subscription_id'),
    admin.from('users').select('stripe_connect_status').not('stripe_connect_account_id', 'is', null),
  ])

  for (const [name, res] of [['rent', rentRes], ['jobs', jobRes], ['subscriptions', subRes]] as const) {
    if (res.error) console.error(`admin/transactions: ${name} query failed`, res.error)
  }

  const rent = rentRes.data || []
  const jobs = jobRes.data || []
  const subs = subRes.data || []

  const ids = Array.from(new Set([
    ...rent.flatMap((r: any) => [r.tenancies?.renter_user_id, r.tenancies?.units?.properties?.owner_user_id]),
    ...jobs.flatMap((b: any) => [b.contractor_user_id, b.jobs?.units?.properties?.owner_user_id]),
    ...subs.map((s: any) => s.landlord_user_id),
  ].filter(Boolean))) as string[]
  const names = new Map<string, string>()
  for (const group of chunk(ids, CHUNK)) {
    const { data } = await admin.from('users').select('id, full_name, email').in('id', group)
    for (const u of data || []) names.set(u.id, u.full_name || u.email || 'Unknown')
  }
  const nameOf = (id?: string | null) => (id ? names.get(id) || 'Unknown' : '—')
  const now = Date.now()

  const place = (unit: any) =>
    unit?.properties?.address
      ? `${unit.properties.address}${unit.unit_number ? `, Unit ${unit.unit_number}` : ''}${unit.properties.city ? `, ${unit.properties.city}` : ''}`
      : ''

  type Tx = {
    id: string
    kind: 'rent' | 'job' | 'subscription'
    date: string
    amount: number
    status: Status
    method: string | null
    from: string
    to: string
    description: string
    place: string
    stripeUrl: string | null
    flags: { label: string; severity: 'red' | 'yellow' | 'info' }[]
  }

  const txs: Tx[] = []

  for (const r of rent as any[]) {
    const paid = Number(r.actual_amount || 0)
    const amount = paid > 0 ? paid : Number(r.expected_amount || 0)
    let status: Status
    const flags: Tx['flags'] = []
    if (r.stripe_status === 'succeeded') status = 'succeeded'
    else if (r.stripe_status === 'refunded_credit_card') {
      status = 'refunded'
      flags.push({ label: 'Credit card refunded (rent is debit/bank only)', severity: 'info' })
    } else if (paid > 0 && !r.stripe_payment_intent_id) {
      status = 'manual'
      flags.push({ label: 'Recorded by landlord, not paid through Stripe', severity: 'info' })
    } else if (r.stripe_status === 'requires_payment') {
      status = 'pending'
      if (now - new Date(r.created_at).getTime() > DAY_MS) flags.push({ label: 'Checkout started, never completed', severity: 'yellow' })
    } else if (r.stripe_status === 'processing') {
      status = 'processing'
    } else {
      status = paid > 0 ? 'succeeded' : 'failed'
    }
    if (status === 'processing' && r.paid_date && now - new Date(r.paid_date).getTime() > 5 * DAY_MS) {
      flags.push({ label: 'Processing 5+ days (bank payments can be slow)', severity: 'yellow' })
    }

    const date = r.paid_date ? `${r.paid_date}T12:00:00` : r.created_at
    const monthLabel = r.month ? new Date(r.month + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''
    txs.push({
      id: `rent-${r.id}`,
      kind: 'rent',
      date,
      amount,
      status,
      method: r.payment_method || null,
      from: nameOf(r.tenancies?.renter_user_id),
      to: nameOf(r.tenancies?.units?.properties?.owner_user_id),
      description: `${monthLabel} rent${Number(r.water_amount) ? ` (incl. $${Number(r.water_amount).toFixed(2)} water)` : ''}${r.late_fee_applied ? ' + late fee' : ''}`,
      place: place(r.tenancies?.units),
      stripeUrl: r.stripe_payment_intent_id ? `${stripeBase}/payments/${r.stripe_payment_intent_id}` : null,
      flags,
    })
  }

  for (const b of jobs as any[]) {
    let status: Status = 'pending'
    const flags: Tx['flags'] = []
    if (b.payment_status === 'paid') status = 'succeeded'
    else if (b.payment_status === 'processing') {
      status = 'processing'
      if (b.paid_at && now - new Date(b.paid_at).getTime() > 5 * DAY_MS) flags.push({ label: 'Processing 5+ days', severity: 'yellow' })
    } else if (b.payment_status === 'failed') status = 'failed'

    txs.push({
      id: `job-${b.id}`,
      kind: 'job',
      date: b.paid_at || new Date().toISOString(),
      amount: Number(b.amount || 0),
      status,
      method: null,
      from: nameOf(b.jobs?.units?.properties?.owner_user_id),
      to: nameOf(b.contractor_user_id),
      description: `${b.jobs?.category || 'Job'} payment`,
      place: place(b.jobs?.units),
      stripeUrl: b.stripe_payment_intent_id ? `${stripeBase}/payments/${b.stripe_payment_intent_id}` : null,
      flags,
    })
  }

  const activeSubs = subs.filter((s: any) => s.tier !== 'free' && s.status === 'active')
  for (const s of activeSubs as any[]) {
    txs.push({
      id: `sub-${s.landlord_user_id}`,
      kind: 'subscription',
      date: s.updated_at,
      amount: TIER_PRICES[s.tier] || 0,
      status: 'succeeded',
      method: 'card',
      from: nameOf(s.landlord_user_id),
      to: 'Prophandld',
      description: `${s.tier.replace('tier_', '$')}/month plan`,
      place: '',
      stripeUrl: s.stripe_subscription_id ? `${stripeBase}/subscriptions/${s.stripe_subscription_id}` : null,
      flags: [],
    })
  }

  txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Money summary — only completed money (succeeded), split by type.
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const sum = (kind: Tx['kind'], since?: number) =>
    txs
      .filter((t) => t.kind === kind && t.status === 'succeeded' && (!since || new Date(t.date).getTime() >= since))
      .reduce((total, t) => total + t.amount, 0)

  // Last six months of rent and job volume for the bar chart.
  const months: { key: string; label: string; rent: number; jobs: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(monthStart.getFullYear(), monthStart.getMonth() - i, 1)
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-US', { month: 'short' }), rent: 0, jobs: 0 })
  }
  for (const t of txs) {
    if (t.status !== 'succeeded' || t.kind === 'subscription') continue
    const d = new Date(t.date)
    const bucket = months.find((m) => m.key === `${d.getFullYear()}-${d.getMonth()}`)
    if (bucket) bucket[t.kind === 'rent' ? 'rent' : 'jobs'] += t.amount
  }

  const connect = connectRes.data || []
  const needsAttention = txs.filter((t) => t.flags.some((f) => f.severity !== 'info')).length

  return NextResponse.json({
    testMode,
    stripeBase,
    transactions: txs,
    summary: {
      rentThisMonth: sum('rent', monthStart.getTime()),
      rentAllTime: sum('rent'),
      jobsThisMonth: sum('job', monthStart.getTime()),
      jobsAllTime: sum('job'),
      mrr: activeSubs.reduce((total: number, s: any) => total + (TIER_PRICES[s.tier] || 0), 0),
      paidSubscribers: activeSubs.length,
      inFlight: txs.filter((t) => t.status === 'processing').reduce((total, t) => total + t.amount, 0),
      inFlightCount: txs.filter((t) => t.status === 'processing').length,
      needsAttention,
      manualRent: txs.filter((t) => t.kind === 'rent' && t.status === 'manual').reduce((total, t) => total + t.amount, 0),
      payoutsReady: connect.filter((u: any) => u.stripe_connect_status === 'active').length,
      payoutsNotReady: connect.filter((u: any) => u.stripe_connect_status !== 'active').length,
    },
    months,
  })
}
