import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cronAuth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendStaleDisputesDigestEmail } from '@/lib/email'

export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000
const STALE_DAYS = 3

// Runs daily (see vercel.json). A dispute pauses the whole job for
// everyone on it, so an admin missing that it's sitting unresolved is a
// worse silent failure than most of the other "stuck" states this app
// already flags for. One reminder per dispute, not a daily repeat —
// stale_reminder_sent_at guards that, same claim-once shape used
// elsewhere in this app (welcomed_at, trial_started_at).
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const cutoff = new Date(Date.now() - STALE_DAYS * DAY_MS).toISOString()

  const { data: disputes, error } = await admin
    .from('disputes')
    .select('id, created_at, raised_by_role, job_id, jobs(category, units(properties(address)))')
    .eq('status', 'open')
    .is('stale_reminder_sent_at', null)
    .lte('created_at', cutoff)

  if (error) {
    console.error('cron/stale-disputes: error loading disputes', error)
    return NextResponse.json({ error: 'Could not load disputes' }, { status: 500 })
  }

  if (!disputes || disputes.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 })
  }

  const now = Date.now()
  const payload = disputes.map((d: any) => {
    const property = d.jobs?.units?.properties
    return {
      jobCategory: d.jobs?.category || 'a job',
      propertyLabel: property?.address || 'a property',
      raisedByRole: d.raised_by_role,
      ageDays: Math.floor((now - new Date(d.created_at).getTime()) / DAY_MS),
      disputeId: d.id,
    }
  })

  await sendStaleDisputesDigestEmail({ disputes: payload }).catch((err) =>
    console.error('cron/stale-disputes: email failed', err)
  )

  const { error: updateError } = await admin
    .from('disputes')
    .update({ stale_reminder_sent_at: new Date().toISOString() })
    .in('id', disputes.map((d: any) => d.id))

  if (updateError) console.error('cron/stale-disputes: error marking reminded', updateError)

  return NextResponse.json({ ok: true, sent: disputes.length })
}
