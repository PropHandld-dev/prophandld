import { supabase } from '@/lib/supabase'

export async function markJobRead(jobId: string, userId: string) {
  const { error } = await supabase
    .from('message_read_state')
    .upsert({ user_id: userId, job_id: jobId, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,job_id' })
  if (error) console.error('markJobRead failed — unread badge will stay stuck until this succeeds:', error)
}

// Given a set of jobs a user is involved in, returns the ids of the ones
// with at least one message from someone else sent after that user's
// last read timestamp for that job (or any message at all if never read).
export async function getUnreadJobIds(jobIds: string[], userId: string): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set()

  const [{ data: reads, error: readsError }, { data: messages }] = await Promise.all([
    supabase.from('message_read_state').select('job_id, last_read_at').eq('user_id', userId).in('job_id', jobIds),
    supabase.from('messages').select('job_id, sender_user_id, created_at').in('job_id', jobIds).neq('sender_user_id', userId),
  ])
  if (readsError) console.error('getUnreadJobIds: could not load read state — everything will look unread until this succeeds:', readsError)

  const lastReadByJob = new Map((reads || []).map((r) => [r.job_id, r.last_read_at]))
  const unread = new Set<string>()

  for (const m of messages || []) {
    const lastRead = lastReadByJob.get(m.job_id)
    if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
      unread.add(m.job_id)
    }
  }

  return unread
}

// Thread (direct-message) equivalents of the two functions above — same
// shape, kept separate rather than a combined "conversation key" API so
// the job-only badge call sites (job lists, job detail nav) don't need to
// change at all.
export async function markThreadRead(threadId: string, userId: string) {
  const { error } = await supabase
    .from('message_read_state')
    .upsert({ user_id: userId, thread_id: threadId, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,thread_id' })
  if (error) console.error('markThreadRead failed — unread badge will stay stuck until this succeeds:', error)
}

export async function getUnreadThreadIds(threadIds: string[], userId: string): Promise<Set<string>> {
  if (threadIds.length === 0) return new Set()

  const [{ data: reads, error: readsError }, { data: messages }] = await Promise.all([
    supabase.from('message_read_state').select('thread_id, last_read_at').eq('user_id', userId).in('thread_id', threadIds),
    supabase.from('messages').select('thread_id, sender_user_id, created_at').in('thread_id', threadIds).neq('sender_user_id', userId),
  ])
  if (readsError) console.error('getUnreadThreadIds: could not load read state — everything will look unread until this succeeds:', readsError)

  const lastReadByThread = new Map((reads || []).map((r) => [r.thread_id, r.last_read_at]))
  const unread = new Set<string>()

  for (const m of messages || []) {
    const lastRead = lastReadByThread.get(m.thread_id)
    if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
      unread.add(m.thread_id)
    }
  }

  return unread
}
