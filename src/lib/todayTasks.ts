import type { SupabaseClient } from '@supabase/supabase-js'
import { getActionableOwnerIdsAdmin } from '@/lib/pm'
import { categoryName } from '@/lib/categoryTaxonomy'
import { rentMonthBounds } from '@/lib/rentAutomation'

// The "Today" list on every Home screen: one ordered list of what this
// person should do, in plain words, each with one button that goes straight
// to it. Built from real records only (no AI), so it's instant, free, and
// every count matches the page it links to.

export type TodayTone = 'urgent' | 'action' | 'upcoming'
export type TodayTask = { id: string; tone: TodayTone; title: string; detail: string; cta: string; href: string }
type Lang = 'en' | 'es'

const DAY = 86400000
const money = (n: number) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const daysWord = (n: number, lang: Lang) => (lang === 'es' ? `${n} día${n === 1 ? '' : 's'}` : `${n} day${n === 1 ? '' : 's'}`)
const fmtDate = (d: string, lang: Lang) =>
  new Date(d + 'T00:00:00').toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const daysUntil = (d: string) => Math.round((new Date(d + 'T00:00:00').getTime() - new Date(todayKey() + 'T00:00:00').getTime()) / DAY)

const ORDER: Record<TodayTone, number> = { urgent: 0, action: 1, upcoming: 2 }
const sortTasks = (tasks: TodayTask[]) => tasks.sort((a, b) => ORDER[a.tone] - ORDER[b.tone])

export async function landlordTodayTasks(admin: SupabaseClient, userId: string, lang: Lang): Promise<TodayTask[]> {
  const es = lang === 'es'
  const T = (en: string, sp: string) => (es ? sp : en)
  const tasks: TodayTask[] = []
  const ownerIds = await getActionableOwnerIdsAdmin(admin, userId)

  const { data: properties } = await admin.from('properties').select('id, address, owner_user_id').in('owner_user_id', ownerIds).eq('archived', false)
  const propById = new Map((properties || []).map((p: any) => [p.id, p]))
  const propertyIds = Array.from(propById.keys())
  const { data: units } = propertyIds.length ? await admin.from('units').select('id, unit_number, property_id').in('property_id', propertyIds) : { data: [] as any[] }
  const unitById = new Map((units || []).map((u: any) => [u.id, u]))
  const unitIds = Array.from(unitById.keys())
  // A PM sees every client's tasks in one list, so each row names the owner.
  const otherOwners = ownerIds.filter((id) => id !== userId)
  const { data: ownerRows } = otherOwners.length ? await admin.from('users').select('id, full_name').in('id', otherOwners) : { data: [] as any[] }
  const ownerName = new Map((ownerRows || []).map((o: any) => [o.id, o.full_name?.trim()]))
  const where = (unitId: string) => {
    const u: any = unitById.get(unitId)
    const p: any = u ? propById.get(u.property_id) : null
    if (!p) return ''
    const owner = ownerName.get(p.owner_user_id)
    return `${owner ? `${owner} · ` : ''}${p.address}${u.unit_number && u.unit_number !== 'Main' ? `, ${T('Unit', 'Unidad')} ${u.unit_number}` : ''}`
  }

  // ---- Jobs ----
  const { data: jobs } = unitIds.length
    ? await admin
        .from('jobs')
        .select('id, category, status, is_emergency, unit_id, proposed_by, proposed_date, proposed_window, schedule_confirmed, contractor_completed_at, self_completed, created_at')
        .in('unit_id', unitIds)
        .in('status', ['pending_approval', 'approved', 'bidding', 'bid_selected', 'scheduled', 'in_progress', 'pending_review', 'completed'])
        .order('created_at', { ascending: false })
        .limit(300)
    : { data: [] as any[] }
  const jobIds = (jobs || []).map((j: any) => j.id)
  const { data: bids } = jobIds.length
    ? await admin.from('bids').select('job_id, status, amount, payment_status, price_change_status, proposed_amount, contractor_user_id').in('job_id', jobIds.slice(0, 300))
    : { data: [] as any[] }
  const bidsByJob = new Map<string, any[]>()
  for (const b of bids || []) bidsByJob.set(b.job_id, [...(bidsByJob.get(b.job_id) || []), b])
  const contractorIds = Array.from(new Set((bids || []).filter((b: any) => b.status === 'accepted').map((b: any) => b.contractor_user_id)))
  const { data: contractors } = contractorIds.length ? await admin.from('users').select('id, full_name').in('id', contractorIds) : { data: [] as any[] }
  const nameById = new Map((contractors || []).map((c: any) => [c.id, c.full_name?.trim()]))

  for (const j of jobs || []) {
    const cat = categoryName(j.category, lang)
    const at = where(j.unit_id)
    const href = `/landlord/jobs/${j.id}`
    const jb = bidsByJob.get(j.id) || []
    const accepted = jb.find((b) => b.status === 'accepted')
    const pending = jb.filter((b) => b.status === 'pending')

    if (j.status === 'pending_approval') {
      tasks.push(j.is_emergency
        ? { id: `new-${j.id}`, tone: 'urgent', title: T(`Emergency: ${cat}`, `Emergencia: ${cat}`), detail: at, cta: T('Handle now', 'Atender'), href }
        : { id: `new-${j.id}`, tone: 'action', title: T(`New repair request: ${cat}`, `Nueva solicitud: ${cat}`), detail: at, cta: T('Review', 'Revisar'), href })
    } else if (j.status === 'approved') {
      tasks.push({ id: `open-${j.id}`, tone: 'action', title: T(`Get bids for ${cat}`, `Pide ofertas para ${cat}`), detail: at, cta: T('Start bidding', 'Abrir ofertas'), href })
    } else if (j.status === 'bidding' && pending.length > 0) {
      tasks.push({ id: `bids-${j.id}`, tone: j.is_emergency ? 'urgent' : 'action', title: T(`Pick a contractor for ${cat}`, `Elige contratista para ${cat}`), detail: `${at} · ${pending.length} ${T(pending.length === 1 ? 'bid' : 'bids', pending.length === 1 ? 'oferta' : 'ofertas')}`, cta: T('Compare bids', 'Comparar'), href })
    } else if ((j.status === 'bid_selected' || j.status === 'scheduled') && j.proposed_by && j.proposed_by !== 'landlord' && !j.schedule_confirmed && j.proposed_date) {
      tasks.push(daysUntil(j.proposed_date) < 0
        ? { id: `time-${j.id}`, tone: 'action', title: T(`Pick a new visit time for ${cat}`, `Elige otra hora de visita: ${cat}`), detail: `${at} · ${T(`${fmtDate(j.proposed_date, lang)} has passed`, `el ${fmtDate(j.proposed_date, lang)} ya pasó`)}`, cta: T('Reschedule', 'Reprogramar'), href }
        : { id: `time-${j.id}`, tone: 'action', title: T(`Confirm the visit time for ${cat}`, `Confirma la hora de la visita: ${cat}`), detail: `${at} · ${fmtDate(j.proposed_date, lang)}`, cta: T('Confirm', 'Confirmar'), href })
    } else if (j.status === 'scheduled' && j.schedule_confirmed && j.proposed_date && daysUntil(j.proposed_date) >= 0 && daysUntil(j.proposed_date) <= 2) {
      const d = daysUntil(j.proposed_date)
      tasks.push({ id: `visit-${j.id}`, tone: 'upcoming', title: d === 0 ? T(`Repair visit today: ${cat}`, `Visita de reparación hoy: ${cat}`) : T(`Repair visit ${fmtDate(j.proposed_date, lang)}: ${cat}`, `Visita de reparación ${fmtDate(j.proposed_date, lang)}: ${cat}`), detail: [at, j.proposed_window].filter(Boolean).join(' · '), cta: T('Details', 'Detalles'), href })
    } else if (j.status === 'pending_review') {
      const left = j.contractor_completed_at ? Math.max(0, 3 - Math.floor((Date.now() - new Date(j.contractor_completed_at).getTime()) / DAY)) : 3
      tasks.push({ id: `review-${j.id}`, tone: left <= 1 ? 'urgent' : 'action', title: T(`Check finished work: ${cat}`, `Revisa el trabajo terminado: ${cat}`), detail: `${at} · ${T(`auto-approves in ${daysWord(left, lang)}`, `se aprueba solo en ${daysWord(left, lang)}`)}`, cta: T('Review', 'Revisar'), href })
    } else if (j.status === 'completed' && accepted && accepted.payment_status !== 'paid' && accepted.payment_status !== 'processing') {
      const who = nameById.get(accepted.contractor_user_id) || T('the contractor', 'el contratista')
      tasks.push({ id: `pay-${j.id}`, tone: 'urgent', title: T(`Pay ${who} ${money(accepted.amount)}`, `Paga a ${who} ${money(accepted.amount)}`), detail: `${cat} · ${at}`, cta: T('Pay now', 'Pagar'), href })
    }
    if (accepted?.price_change_status === 'pending') {
      tasks.push({ id: `price-${j.id}`, tone: 'action', title: T(`Price change on ${cat}: ${money(accepted.amount)} → ${money(accepted.proposed_amount)}`, `Cambio de precio en ${cat}: ${money(accepted.amount)} → ${money(accepted.proposed_amount)}`), detail: at, cta: T('Decide', 'Decidir'), href })
    }
  }

  // ---- Rent behind: any of the last 12 months (same window as the Home
  // page's own list); this month only counts once its grace period is over.
  const { data: tenancies } = unitIds.length
    ? await admin.from('tenancies').select('id, unit_id, renter_user_id, rent_due_day, grace_period_days, lease_end').in('unit_id', unitIds).eq('ended', false)
    : { data: [] as any[] }
  const renterIds = Array.from(new Set((tenancies || []).map((t: any) => t.renter_user_id).filter(Boolean)))
  const { data: renters } = renterIds.length ? await admin.from('users').select('id, full_name').in('id', renterIds) : { data: [] as any[] }
  const renterName = new Map((renters || []).map((r: any) => [r.id, r.full_name?.trim()]))
  const tIds = (tenancies || []).map((t: any) => t.id)
  const { month: thisMonth, following } = rentMonthBounds(0)
  const { month: windowStart } = rentMonthBounds(-12)
  const { data: payments } = tIds.length
    ? await admin.from('rent_payments').select('tenancy_id, month, expected_amount, actual_amount, stripe_status').in('tenancy_id', tIds).gte('month', windowStart).lt('month', following)
    : { data: [] as any[] }
  const owedByTenancy = new Map<string, { owed: number; months: number; current: boolean }>()
  for (const p of payments || []) {
    const owed = Number(p.expected_amount || 0) - Number(p.actual_amount || 0)
    if (owed <= 0.005 || p.stripe_status === 'processing') continue
    const prev = owedByTenancy.get(p.tenancy_id) || { owed: 0, months: 0, current: false }
    owedByTenancy.set(p.tenancy_id, { owed: prev.owed + owed, months: prev.months + 1, current: prev.current || p.month.slice(0, 7) === thisMonth.slice(0, 7) })
  }
  const now = new Date()
  for (const t of tenancies || []) {
    const o = owedByTenancy.get(t.id)
    if (!o) continue
    const due = new Date(now.getFullYear(), now.getMonth(), t.rent_due_day ?? 1)
    const pastGrace = Math.floor((now.getTime() - due.getTime()) / DAY) - (t.grace_period_days ?? 5)
    const olderMonths = o.current ? o.months - 1 : o.months
    if (olderMonths === 0 && pastGrace < 0) continue
    const unit: any = unitById.get(t.unit_id)
    const who = renterName.get(t.renter_user_id) || T('A tenant', 'Un inquilino')
    const detail = olderMonths > 0
      ? T(`${o.months} month${o.months === 1 ? '' : 's'} not fully paid`, `${o.months} mes${o.months === 1 ? '' : 'es'} sin pagar completo`)
      : T(`${daysWord(pastGrace, lang)} past the grace period`, `${daysWord(pastGrace, lang)} después del período de gracia`)
    tasks.push({
      id: `rent-${t.id}`,
      tone: 'urgent',
      title: T(`${who} owes ${money(o.owed)} rent`, `${who} debe ${money(o.owed)} de renta`),
      detail: `${where(t.unit_id)} · ${detail}`,
      cta: T('See rent', 'Ver renta'),
      href: unit ? `/landlord/properties/${unit.property_id}/units/${unit.id}/rent` : '/landlord/rent',
    })
  }

  // ---- Leases ending within 60 days ----
  for (const t of tenancies || []) {
    if (!t.lease_end) continue
    const d = daysUntil(t.lease_end)
    if (d < 0 || d > 60) continue
    const unit: any = unitById.get(t.unit_id)
    tasks.push({
      id: `lease-${t.id}`,
      tone: d <= 14 ? 'action' : 'upcoming',
      title: T(`Lease ends in ${daysWord(d, lang)}`, `El contrato termina en ${daysWord(d, lang)}`),
      detail: `${renterName.get(t.renter_user_id) || ''} · ${where(t.unit_id)}`.replace(/^ · /, ''),
      cta: T('Plan renewal', 'Planear renovación'),
      href: unit ? `/landlord/properties/${unit.property_id}/units/${unit.id}` : '/landlord/properties',
    })
  }

  // ---- Compliance: inside each item's own reminder window (default 30 days) ----
  const { data: compliance } = propertyIds.length
    ? await admin.from('compliance_items').select('id, item_type, expiry_date, reminder_days, property_id').in('property_id', propertyIds).not('expiry_date', 'is', null).limit(500)
    : { data: [] as any[] }
  for (const c of compliance || []) {
    const d = daysUntil(c.expiry_date)
    if (d > (c.reminder_days ?? 30)) continue
    const p: any = propById.get(c.property_id)
    tasks.push({
      id: `comp-${c.id}`,
      tone: d < 0 ? 'urgent' : d <= 7 ? 'action' : 'upcoming',
      title: d < 0 ? T(`${c.item_type} expired`, `${c.item_type} vencido`) : d === 0 ? T(`${c.item_type} expires today`, `${c.item_type} vence hoy`) : T(`${c.item_type} expires in ${daysWord(d, lang)}`, `${c.item_type} vence en ${daysWord(d, lang)}`),
      detail: p?.address || '',
      cta: T('Renew', 'Renovar'),
      href: `/landlord/properties/${c.property_id}/compliance`,
    })
  }

  // ---- Recently finished work to rate, and tenant invites not yet accepted ----
  const since = new Date(Date.now() - 60 * DAY).toISOString()
  const [{ data: finished }, { data: invites }] = await Promise.all([
    unitIds.length
      ? admin.from('jobs').select('id, category, unit_id, self_completed').in('unit_id', unitIds).in('status', ['completed', 'archived']).gte('created_at', since).order('created_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as any[] }),
    unitIds.length
      ? admin.from('tenancy_invites').select('id, renter_email, unit_id').in('unit_id', unitIds).eq('status', 'pending').limit(50)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const toRate = (finished || []).filter((j: any) => !j.self_completed)
  if (toRate.length) {
    const { data: reviewed } = await admin.from('contractor_reviews').select('job_id').eq('reviewer_user_id', userId).in('job_id', toRate.map((j: any) => j.id))
    const done = new Set((reviewed || []).map((r: any) => r.job_id))
    for (const j of toRate.filter((x: any) => !done.has(x.id)).slice(0, 5)) {
      tasks.push({ id: `rate-${j.id}`, tone: 'upcoming', title: T(`Rate the contractor: ${categoryName(j.category, lang)}`, `Califica al contratista: ${categoryName(j.category, lang)}`), detail: where(j.unit_id), cta: T('Rate', 'Calificar'), href: `/landlord/jobs/${j.id}` })
    }
  }
  for (const inv of invites || []) {
    const unit: any = unitById.get(inv.unit_id)
    tasks.push({ id: `inv-${inv.id}`, tone: 'upcoming', title: T(`${inv.renter_email} hasn't joined yet`, `${inv.renter_email} aún no se ha unido`), detail: where(inv.unit_id), cta: T('Resend', 'Reenviar'), href: unit ? `/landlord/properties/${unit.property_id}/units/${unit.id}` : '/landlord/properties' })
  }

  // ---- Owner decisions from their property manager ----
  const [{ data: approvals }, { data: portfolios }] = await Promise.all([
    admin.from('pm_owner_messages').select('id, action').eq('owner_user_id', userId).eq('kind', 'approval').eq('action_status', 'pending').limit(10),
    admin.from('pm_client_portfolios').select('id, status, requested_by, management_fee, management_fee_percent, fee_owner_approved_at, pm_organizations(name)').eq('owner_user_id', userId).in('status', ['pending', 'accepted']),
  ])
  for (const a of approvals || []) {
    const act: any = a.action || {}
    tasks.push({ id: `appr-${a.id}`, tone: 'action', title: T(`Approve: ${act.title || 'request from your property manager'}`, `Aprobar: ${act.title || 'solicitud de tu administrador'}`), detail: act.amount ? money(act.amount) : '', cta: T('Decide', 'Decidir'), href: '/landlord/pm' })
  }
  for (const p of portfolios || []) {
    const org = (p.pm_organizations as any)?.name || T('A property manager', 'Un administrador')
    // A pending PM invite already has its own banner on Home (PmInviteBanner).
    if (p.status === 'accepted' && !p.fee_owner_approved_at && (Number(p.management_fee) > 0 || Number(p.management_fee_percent) > 0)) {
      tasks.push({ id: `fee-${p.id}`, tone: 'action', title: T(`Approve ${org}'s management fee`, `Aprueba la tarifa de ${org}`), detail: T('Nothing is charged until you approve', 'No se cobra nada hasta que apruebes'), cta: T('Review fee', 'Ver tarifa'), href: '/landlord/pm' })
    }
  }

  // ---- Getting paid ----
  if ((tenancies || []).length > 0) {
    const { data: me } = await admin.from('users').select('stripe_connect_status').eq('id', userId).maybeSingle()
    if (me?.stripe_connect_status !== 'active' && ownerIds.length === 1) {
      tasks.push({ id: 'payout', tone: 'upcoming', title: T('Set up how you get paid rent', 'Configura cómo recibes la renta'), detail: T('Takes about 5 minutes. Tenants can then pay online.', 'Toma unos 5 minutos. Así tus inquilinos pueden pagar en línea.'), cta: T('Set up', 'Configurar'), href: '/profile#billing' })
    }
  }

  return sortTasks(tasks)
}

export async function renterTodayTasks(admin: SupabaseClient, userId: string, tenancyId: string | null, lang: Lang): Promise<TodayTask[]> {
  const es = lang === 'es'
  const T = (en: string, sp: string) => (es ? sp : en)
  const tasks: TodayTask[] = []

  if (tenancyId) {
    const { data: t } = await admin.from('tenancies').select('id, rent_amount, rent_due_day, grace_period_days, lease_end').eq('id', tenancyId).maybeSingle()
    if (t) {
      const { month, following, firstDate } = rentMonthBounds(0)
      const { data: p } = await admin.from('rent_payments').select('expected_amount, actual_amount').eq('tenancy_id', t.id).gte('month', month).lt('month', following).maybeSingle()
      const dueDay = t.rent_due_day ?? 1
      const due = new Date(firstDate.getFullYear(), firstDate.getMonth(), dueDay)
      const owed = p ? Number(p.expected_amount || 0) - Number(p.actual_amount || 0) : 0
      const sinceDue = Math.floor((Date.now() - due.getTime()) / DAY)
      if (p && owed > 0.005) {
        if (sinceDue > (t.grace_period_days ?? 5)) tasks.push({ id: 'rent', tone: 'urgent', title: T(`Rent is late: ${money(owed)}`, `Renta atrasada: ${money(owed)}`), detail: T(`It was due ${fmtDate(due.toLocaleDateString('en-CA'), lang)}`, `Vencía el ${fmtDate(due.toLocaleDateString('en-CA'), lang)}`), cta: T('Pay rent', 'Pagar renta'), href: '/renter/rent' })
        else if (sinceDue >= -7) tasks.push({ id: 'rent', tone: 'action', title: T(`Pay rent: ${money(owed)}`, `Paga la renta: ${money(owed)}`), detail: sinceDue >= 0 ? T('Due now, still in the grace period', 'Vence ahora, aún en el período de gracia') : T(`Due ${fmtDate(due.toLocaleDateString('en-CA'), lang)}`, `Vence el ${fmtDate(due.toLocaleDateString('en-CA'), lang)}`), cta: T('Pay rent', 'Pagar renta'), href: '/renter/rent' })
      } else {
        // Paid (or not yet billed): show next month's date as a calm heads-up.
        const next = new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, dueDay).toLocaleDateString('en-CA')
        const d = daysUntil(next)
        if (d <= 7) tasks.push({ id: 'rent-next', tone: 'upcoming', title: T(`Rent of ${money(t.rent_amount)} is due ${fmtDate(next, lang)}`, `Renta de ${money(t.rent_amount)} vence el ${fmtDate(next, lang)}`), detail: T('Bank transfer is free and takes 1-3 business days', 'La transferencia bancaria es gratis y tarda 1-3 días hábiles'), cta: T('Pay early', 'Pagar antes'), href: '/renter/rent' })
      }
      if (t.lease_end) {
        const d = daysUntil(t.lease_end)
        if (d >= 0 && d <= 60) tasks.push({ id: 'lease', tone: 'upcoming', title: T(`Your lease ends in ${daysWord(d, lang)}`, `Tu contrato termina en ${daysWord(d, lang)}`), detail: T('Talk to your landlord about renewing', 'Habla con tu arrendador sobre renovar'), cta: T('Message', 'Escribir'), href: '/renter/messages' })
      }
    }
  }

  const { data: jobs } = await admin
    .from('jobs')
    .select('id, category, status, proposed_by, proposed_date, proposed_window, schedule_confirmed, schedule_ask_tenant')
    .eq('reported_by', userId)
    .in('status', ['bid_selected', 'scheduled', 'in_progress'])
    .limit(20)
  for (const j of jobs || []) {
    const cat = categoryName(j.category, lang)
    const href = `/renter/jobs/${j.id}`
    if (j.schedule_ask_tenant && !j.proposed_date) {
      tasks.push({ id: `time-${j.id}`, tone: 'action', title: T(`Pick a time for the ${cat} repair`, `Elige una hora para la reparación: ${cat}`), detail: T('Your landlord asked when works for you', 'Tu arrendador preguntó qué horario te funciona'), cta: T('Pick a time', 'Elegir hora'), href })
    } else if (j.proposed_date && !j.schedule_confirmed && j.proposed_by !== 'renter') {
      tasks.push(daysUntil(j.proposed_date) < 0
        ? { id: `time-${j.id}`, tone: 'action', title: T(`Suggest a new time for the ${cat} repair`, `Sugiere otra hora para la reparación: ${cat}`), detail: T(`The proposed date (${fmtDate(j.proposed_date, lang)}) has passed`, `La fecha propuesta (${fmtDate(j.proposed_date, lang)}) ya pasó`), cta: T('Suggest a time', 'Sugerir hora'), href }
        : { id: `time-${j.id}`, tone: 'action', title: T(`Confirm the visit time: ${cat}`, `Confirma la hora de la visita: ${cat}`), detail: fmtDate(j.proposed_date, lang), cta: T('Confirm', 'Confirmar'), href })
    } else if (j.schedule_confirmed && j.proposed_date) {
      const d = daysUntil(j.proposed_date)
      if (d >= 0 && d <= 2) tasks.push({ id: `visit-${j.id}`, tone: 'upcoming', title: d === 0 ? T(`Repair visit today: ${cat}`, `Visita de reparación hoy: ${cat}`) : T(`Repair visit ${fmtDate(j.proposed_date, lang)}: ${cat}`, `Visita de reparación ${fmtDate(j.proposed_date, lang)}: ${cat}`), detail: T('Make sure someone can let them in', 'Asegúrate de que alguien pueda abrir'), cta: T('Details', 'Detalles'), href })
    }
  }
  return sortTasks(tasks)
}
