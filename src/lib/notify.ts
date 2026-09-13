import type { NotifyType } from '@/lib/email'

// Fire-and-forget — never blocks or throws into the caller's update flow.
export function notify(type: NotifyType, jobId: string) {
  fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, jobId }),
  }).catch((err) => {
    console.error('notify() failed:', err)
  })
}
