import type { NotifyType } from '@/lib/email'

type Role = 'landlord' | 'renter' | 'contractor'

// Fire-and-forget — never blocks or throws into the caller's update flow.
// excludeRole skips the caller's own role (e.g. don't email the person
// who just proposed a schedule time about their own proposal).
export function notify(type: NotifyType, jobId: string, excludeRole?: Role) {
  fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, jobId, excludeRole }),
  }).catch((err) => {
    console.error('notify() failed:', err)
  })
}

// job_open is different from every other notification type: if it reaches
// zero contractors, the job doesn't just fail to notify someone about an
// update, it silently sits open for bidding with no way for the landlord
// to ever find out why nobody's bidding — could be no local contractors,
// could be a bad property ZIP, could be a real config problem. Every other
// notification stays fire-and-forget on purpose (low stakes, keeps the UI
// snappy); this one specific case is worth the one extra await so the
// caller can actually tell the landlord what happened.
export async function notifyJobOpen(jobId: string): Promise<{ sent: number } | null> {
  try {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'job_open', jobId }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || typeof data?.sent !== 'number') return null
    return { sent: data.sent }
  } catch (err) {
    console.error('notifyJobOpen() failed:', err)
    return null
  }
}
