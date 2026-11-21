import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { TIME_WINDOWS, validateScheduleTime } from '@/lib/scheduleWindows'

// The tenant's own changes to a repair job: propose a visit time, confirm
// the other side's time, or update entry instructions. Tenants can't write
// to the jobs table directly (the database only lets landlords and the
// assigned contractor do that), so every one of these used to fail with
// "Could not schedule" / "Could not save". Done here instead, after
// checking the caller actually lives in that unit, with the same
// safeguards the page had: no past dates, valid windows, and "changed
// elsewhere" protection on confirm and on entry notes.
//
// POST { action: 'propose', date, window, time? }
// POST { action: 'confirm', date, window }        (the proposal being agreed to)
// POST { action: 'access_notes', notes, previous } (previous = notes when the editor opened)

const todayNY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user.app_metadata?.role !== 'renter') return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  const admin = getSupabaseAdmin()
  const { data: job } = await admin
    .from('jobs')
    .select('id, unit_id, status, reported_by, proposed_date, proposed_window, proposed_by, schedule_confirmed, access_notes')
    .eq('id', jobId)
    .maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // A tenant or co-tenant on an active lease for this unit (or whoever
  // reported it), never anyone else.
  const [{ data: lease }, { data: coLease }] = await Promise.all([
    admin.from('tenancies').select('id').eq('unit_id', job.unit_id).eq('renter_user_id', user.id).eq('ended', false).limit(1),
    admin.from('tenancy_occupants').select('tenancy_id, tenancies!inner(unit_id, ended)').eq('renter_user_id', user.id).eq('tenancies.unit_id', job.unit_id).eq('tenancies.ended', false).limit(1),
  ])
  if (!lease?.length && !coLease?.length && job.reported_by !== user.id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const action = body.action

  if (action === 'propose' || action === 'confirm') {
    if (!['bid_selected', 'scheduled'].includes(job.status)) {
      return NextResponse.json({ error: 'This job isn’t at the scheduling step.' }, { status: 409 })
    }
  }

  if (action === 'propose') {
    const date = String(body.date || '')
    const window = String(body.window || '')
    const time = body.time ? String(body.time) : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Pick a date.' }, { status: 400 })
    if (date < todayNY()) return NextResponse.json({ error: 'That date has already passed. Pick today or later.' }, { status: 400 })
    if (!TIME_WINDOWS.some((w) => w.value === window)) return NextResponse.json({ error: 'Pick a time of day.' }, { status: 400 })
    if (time && !/^\d{2}:\d{2}$/.test(time)) return NextResponse.json({ error: 'Enter a valid time.' }, { status: 400 })
    const timeError = validateScheduleTime(window, time)
    if (timeError) return NextResponse.json({ error: timeError }, { status: 400 })

    const { error } = await admin
      .from('jobs')
      .update({ proposed_date: date, proposed_window: window, proposed_time: time || null, proposed_by: 'renter', schedule_confirmed: false, schedule_ask_tenant: false })
      .eq('id', jobId)
    if (error) {
      console.error('jobs/tenant: propose failed', error)
      return NextResponse.json({ error: 'Could not save that time. Try again.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'confirm') {
    if (!job.proposed_date || job.schedule_confirmed) return NextResponse.json({ error: 'There’s no time waiting for you to confirm.' }, { status: 409 })
    if (job.proposed_by === 'renter') return NextResponse.json({ error: 'You proposed this time; the other side confirms it.' }, { status: 409 })
    // Only the proposal the tenant was looking at: if it changed since,
    // confirming would lock in a time they never saw.
    if (job.proposed_date !== body.date || job.proposed_window !== body.window) {
      return NextResponse.json({ error: 'The proposed time just changed. Here’s the latest.', changed: true }, { status: 409 })
    }
    if (job.proposed_date < todayNY()) return NextResponse.json({ error: 'That proposed date has passed. Suggest a new time instead.' }, { status: 409 })
    const { data: updated, error } = await admin
      .from('jobs')
      .update({ schedule_confirmed: true, status: 'scheduled' })
      .eq('id', jobId)
      .eq('proposed_date', job.proposed_date)
      .eq('proposed_window', job.proposed_window)
      .eq('schedule_confirmed', false)
      .select('id')
    if (error || !updated?.length) {
      if (error) console.error('jobs/tenant: confirm failed', error)
      return NextResponse.json({ error: 'Could not confirm. Refresh and try again.' }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'access_notes') {
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : ''
    const previous = typeof body.previous === 'string' ? body.previous : null
    let q = admin.from('jobs').update({ access_notes: notes || null }).eq('id', jobId)
    q = previous === null ? q.is('access_notes', null) : q.eq('access_notes', previous)
    const { data: updated, error } = await q.select('id')
    if (error || !updated?.length) {
      if (error) console.error('jobs/tenant: access notes failed', error)
      return NextResponse.json({ error: 'changed', changed: true }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
