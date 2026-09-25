import type { SupabaseClient } from '@supabase/supabase-js'
import type { NotifyJobInfo } from '@/lib/email'

// "Tue, Sep 22 · Morning" (or "· 9:30 AM" when an exact time was set).
// The date is a plain calendar date, so it is read as UTC to keep it from
// sliding a day earlier in US time zones.
export function formatWhen(date?: string | null, window?: string | null, time?: string | null) {
  if (!date) return null
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return null
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  let when = ''
  if (time) {
    const [hh, mm] = time.split(':').map(Number)
    if (!Number.isNaN(hh)) {
      when = `${((hh + 11) % 12) + 1}:${String(mm || 0).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`
    }
  }
  if (!when && window) when = window.charAt(0).toUpperCase() + window.slice(1)
  return [day, when].filter(Boolean).join(' · ')
}

// Extra facts that make a notification say what actually happened: the
// proposed time, the price, the contractor's name. Best effort only: if any
// lookup fails the notification still goes out with the basics.
export async function loadNotifyExtras(admin: SupabaseClient, jobId: string): Promise<Partial<NotifyJobInfo>> {
  const extras: Partial<NotifyJobInfo> = {}

  try {
    const { data: job } = await admin
      .from('jobs')
      .select('proposed_date, proposed_window, proposed_time, units(unit_number)')
      .eq('id', jobId)
      .maybeSingle()
    if (job) {
      extras.when = formatWhen(job.proposed_date, job.proposed_window, job.proposed_time)
      const unit = (job.units as any)?.unit_number
      if (unit) extras.unit = String(unit)
    }
  } catch (err) {
    console.error('notify extras: job lookup failed', { jobId, err })
  }

  try {
    const { data: accepted } = await admin
      .from('bids')
      .select('contractor_user_id, amount, proposed_amount, payment_status')
      .eq('job_id', jobId)
      .eq('status', 'accepted')
      .maybeSingle()

    // Before anyone is chosen (a new bid just arrived), use the newest bid.
    let bid = accepted
    if (!bid) {
      const { data: newest } = await admin
        .from('bids')
        .select('contractor_user_id, amount, proposed_amount, payment_status')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      bid = newest
    }

    if (bid) {
      if (bid.amount != null) extras.amount = Number(bid.amount)
      if (bid.proposed_amount != null && Number(bid.proposed_amount) !== Number(bid.amount)) {
        extras.requestedAmount = Number(bid.proposed_amount)
      }
      // Only meaningful for the accepted bid — an unaccepted one has no
      // payment of its own to report on.
      if (accepted) extras.paymentStatus = (accepted.payment_status as any) ?? 'unpaid'
      if (bid.contractor_user_id) {
        const { data: person } = await admin.from('users').select('full_name').eq('id', bid.contractor_user_id).maybeSingle()
        if (person?.full_name) extras.contractorName = person.full_name
      }
    }
  } catch (err) {
    console.error('notify extras: bid lookup failed', { jobId, err })
  }

  return extras
}
