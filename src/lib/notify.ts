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
