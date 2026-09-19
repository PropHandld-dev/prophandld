import { supabase } from '@/lib/supabase'

// Posts a short status-update line into a job's chat thread, authored
// by whoever just triggered the event (schedule confirmed, job marked
// complete, etc.) — deliberately not a true "system" message, which
// would need sender_user_id to be nullable and every chat surface to
// render an unattributed-message style. Attributing it to the actor
// is accurate (they did just do the thing) and needs zero schema or
// rendering changes, since it's a completely normal message row.
export async function postJobStatusMessage(jobId: string, userId: string, body: string) {
  const { error } = await supabase.from('messages').insert({ job_id: jobId, sender_user_id: userId, body })
  if (error) console.error('postJobStatusMessage failed:', { jobId, body, error })
}
