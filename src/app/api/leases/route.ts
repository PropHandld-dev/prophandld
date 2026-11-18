import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { canActForOwner } from '@/lib/pm'
import { hasAiAssistAccess } from '@/lib/aiAssist'
import { tooManyAiAssistRequests } from '@/lib/aiAssistRateLimit'
import { claudeJson } from '@/lib/claude'
import { ruleFlags, type LeaseInputs, type LeaseClause, type LeaseFlag } from '@/lib/paLease'

export const maxDuration = 45

const UTIL_KEYS = ['electric', 'gas', 'water', 'sewer', 'trash', 'internet'] as const
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : fallback
}
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

async function loadUnit(unitId: string) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  const admin = getSupabaseAdmin()
  const { data: unit } = await admin
    .from('units')
    .select('id, unit_number, property_id, properties(address, city, state, zip, owner_user_id)')
    .eq('id', unitId)
    .maybeSingle()
  const property: any = (unit as any)?.properties
  if (!unit || !property || !(await canActForOwner(admin, user.id, property.owner_user_id))) {
    return { error: NextResponse.json({ error: 'Unit not found' }, { status: 404 }) }
  }
  return { user, admin, unit: unit as any, property }
}

// GET ?unitId= : details to prefill, and the latest saved draft.
export async function GET(request: NextRequest) {
  const unitId = request.nextUrl.searchParams.get('unitId') || ''
  const ctx = await loadUnit(unitId)
  if ('error' in ctx) return ctx.error
  const { admin, unit, property } = ctx

  const [{ data: owner }, { data: portfolio }, { data: tenancy }, { data: latest }] = await Promise.all([
    admin.from('users').select('full_name').eq('id', property.owner_user_id).maybeSingle(),
    admin.from('pm_client_portfolios').select('pm_organizations(name)').eq('owner_user_id', property.owner_user_id).eq('status', 'accepted').maybeSingle(),
    admin
      .from('tenancies')
      .select('id, renter_user_id, rent_amount, rent_due_day, late_fee_amount, grace_period_days, security_deposit, lease_start, lease_end, occupants, pets, escalation_percent')
      .eq('unit_id', unitId)
      .eq('ended', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('generated_leases').select('id, inputs, extra_clauses, review_flags, created_at').eq('unit_id', unitId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const { data: renter } = tenancy?.renter_user_id ? await admin.from('users').select('full_name').eq('id', tenancy.renter_user_id).maybeSingle() : { data: null }

  const start = new Date()
  start.setMonth(start.getMonth() + 1, 1)
  const startStr = tenancy?.lease_start || start.toLocaleDateString('en-CA')
  const endDefault = new Date(startStr + 'T00:00:00')
  endDefault.setFullYear(endDefault.getFullYear() + 1)
  endDefault.setDate(endDefault.getDate() - 1)
  const rent = Number(tenancy?.rent_amount || 0)
  const prefill: LeaseInputs = {
    landlordName: owner?.full_name || '',
    agentName: (portfolio as any)?.pm_organizations?.name || null,
    tenantNames: [renter?.full_name || ''].filter(Boolean),
    address: property.address,
    unitLabel: unit.unit_number && unit.unit_number !== 'Main' ? `Unit ${unit.unit_number}` : null,
    city: property.city || '',
    state: property.state || 'PA',
    zip: property.zip || '',
    startDate: startStr,
    endDate: tenancy ? tenancy.lease_end || null : endDefault.toLocaleDateString('en-CA'),
    rent,
    dueDay: tenancy?.rent_due_day || 1,
    lateFee: Number(tenancy?.late_fee_amount || 0),
    graceDays: tenancy?.grace_period_days ?? 5,
    deposit: Number(tenancy?.security_deposit ?? rent),
    occupants: tenancy?.occupants && Number.isNaN(Number(tenancy.occupants)) ? String(tenancy.occupants) : '',
    pets: tenancy?.pets ? 'with_approval' : 'none',
    petDeposit: 0,
    smoking: false,
    utilities: { electric: 'tenant', gas: 'tenant', water: 'landlord', sewer: 'landlord', trash: 'landlord', internet: 'tenant' },
    parking: '',
    builtBefore1978: 'unknown',
    inPhiladelphia: /philadelphia/i.test(property.city || ''),
    noticeToVacateDays: 30,
    escalationPercent: tenancy?.escalation_percent ? Number(tenancy.escalation_percent) : null,
    extraNotes: '',
  }
  return NextResponse.json({
    prefill,
    latest: latest ? { id: latest.id, inputs: latest.inputs, extraClauses: latest.extra_clauses, flags: latest.review_flags, createdAt: latest.created_at } : null,
  })
}

// POST { unitId, inputs } : build the lease and save the draft.
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => ({}))) as { unitId?: string; inputs?: any }
  const ctx = await loadUnit(b.unitId || '')
  if ('error' in ctx) return ctx.error
  const { user, admin, unit, property } = ctx
  const r = b.inputs || {}

  if (!isDate(r.startDate)) return NextResponse.json({ error: 'Choose a start date' }, { status: 400 })
  if (r.endDate && !isDate(r.endDate)) return NextResponse.json({ error: 'Check the end date' }, { status: 400 })
  const rent = num(r.rent, 1, 1_000_000, NaN)
  if (!Number.isFinite(rent)) return NextResponse.json({ error: 'Enter the monthly rent' }, { status: 400 })
  const utilities = Object.fromEntries(UTIL_KEYS.map((k) => [k, r.utilities?.[k] === 'landlord' ? 'landlord' : 'tenant'])) as LeaseInputs['utilities']
  const inputs: LeaseInputs = {
    landlordName: str(r.landlordName, 120) || 'Landlord',
    agentName: str(r.agentName, 120) || null,
    tenantNames: (Array.isArray(r.tenantNames) ? r.tenantNames : []).map((n: unknown) => str(n, 120)).filter(Boolean).slice(0, 8),
    address: property.address,
    unitLabel: unit.unit_number && unit.unit_number !== 'Main' ? `Unit ${unit.unit_number}` : null,
    city: property.city || '',
    state: property.state || 'PA',
    zip: property.zip || '',
    startDate: r.startDate,
    endDate: r.endDate || null,
    rent,
    dueDay: Math.round(num(r.dueDay, 1, 28, 1)),
    lateFee: num(r.lateFee, 0, 100000, 0),
    graceDays: Math.round(num(r.graceDays, 0, 30, 5)),
    deposit: num(r.deposit, 0, 1_000_000, 0),
    occupants: str(r.occupants, 300),
    pets: r.pets === 'allowed' || r.pets === 'with_approval' ? r.pets : 'none',
    petDeposit: num(r.petDeposit, 0, 100000, 0),
    smoking: r.smoking === true,
    utilities,
    parking: str(r.parking, 200),
    builtBefore1978: r.builtBefore1978 === 'yes' || r.builtBefore1978 === 'no' ? r.builtBefore1978 : 'unknown',
    inPhiladelphia: r.inPhiladelphia === true,
    noticeToVacateDays: Math.round(num(r.noticeToVacateDays, 15, 120, 30)),
    escalationPercent: r.escalationPercent ? num(r.escalationPercent, 0, 25, 0) || null : null,
    extraNotes: str(r.extraNotes, 2000),
  }

  let extraClauses: LeaseClause[] = []
  const flags: LeaseFlag[] = ruleFlags(inputs)
  if (inputs.extraNotes) {
    const billed = property.owner_user_id
    if (!(await hasAiAssistAccess(admin, billed)) && !(await hasAiAssistAccess(admin, user.id))) {
      return NextResponse.json({ error: 'Prophandld AI is needed to turn your notes into lease terms. Clear the notes box to create the lease without them.', needsAi: true }, { status: 402 })
    }
    if (await tooManyAiAssistRequests('lease-generate', user.id, 15)) {
      return NextResponse.json({ error: 'Too many lease drafts in a short time. Try again in a few minutes.' }, { status: 429 })
    }
    try {
      const out = await claudeJson<{ clauses: LeaseClause[]; flags: { severity: string; message: string }[] }>({
        system:
          'You help a Pennsylvania landlord turn their own plain-language house rules into clear residential lease clauses. ' +
          'Write in plain language (Pennsylvania Plain Language Consumer Contract Act). Each clause: a short title and 1-3 sentences. ' +
          'Do NOT restate rent, deposit, late fees, term, utilities, pets, smoking, entry or repairs; those are already in the lease. ' +
          'Never add a term that waives tenant rights, limits the landlord\'s duty to keep the home habitable, waives notice the law requires, ' +
          'allows lockouts or utility shutoffs, or discriminates. If a note asks for something like that, leave it out and add a warning flag explaining why. ' +
          'Also flag anything in the notes that may conflict with Pennsylvania or Philadelphia law or fair housing law. Do not give legal conclusions; say "may" and suggest attorney review.',
        prompt:
          `Property: ${inputs.city}, ${inputs.state}${inputs.inPhiladelphia ? ' (Philadelphia)' : ''}. Monthly rent $${inputs.rent}.\n` +
          `Landlord's notes:\n"""${inputs.extraNotes}"""\n\n` +
          'Return {"clauses":[{"title":"...","text":"..."}],"flags":[{"severity":"warning"|"info","message":"..."}]}. Max 8 clauses.',
        maxTokens: 1500,
        track: { billedUserId: billed, callerUserId: user.id, feature: 'lease-generate' },
      })
      extraClauses = (Array.isArray(out?.clauses) ? out.clauses : [])
        .filter((c) => c && typeof c.title === 'string' && typeof c.text === 'string')
        .slice(0, 8)
        .map((c) => ({ title: c.title.trim().slice(0, 80), text: c.text.trim().slice(0, 800) }))
      for (const f of Array.isArray(out?.flags) ? out.flags : []) {
        if (f && typeof f.message === 'string') flags.push({ severity: f.severity === 'warning' ? 'warning' : 'info', message: f.message.slice(0, 400) })
      }
    } catch (err) {
      console.error('leases: AI failed', err)
      return NextResponse.json({ error: 'Could not write the extra terms right now. Try again, or clear the notes box.' }, { status: 500 })
    }
  }

  const { data: saved, error } = await admin
    .from('generated_leases')
    .insert({ unit_id: unit.id, owner_user_id: property.owner_user_id, created_by: user.id, inputs, extra_clauses: extraClauses, review_flags: flags })
    .select('id, created_at')
    .single()
  if (error || !saved) {
    console.error('leases: save failed', error)
    return NextResponse.json({ error: 'Could not save the draft. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ id: saved.id, inputs, extraClauses, flags, createdAt: saved.created_at })
}
