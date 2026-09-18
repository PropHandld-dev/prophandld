import { supabase } from '@/lib/supabase'

// Read state lives in localStorage now, not a `message_read_state` table.
// That table kept breaking in production for reasons that were always
// some flavor of "the grant/policy on this specific table isn't quite
// right" — three separate rounds of SQL fixes and the unread badge kept
// getting stuck. The underlying data this needs (a per-conversation
// "when did I last look at this") doesn't need to be shared across
// devices to be useful, so moving it client-side removes an entire
// category of server-side permission failure at the cost of read state
// not syncing across browsers/devices — a fine trade for how much more
// reliable this makes the badge.
function readKey(userId: string, kind: 'job' | 'thread', id: string) {
  return `ph_read_${userId}_${kind}_${id}`
}

function getLastRead(userId: string, kind: 'job' | 'thread', id: string): string | null {
  try {
    return localStorage.getItem(readKey(userId, kind, id))
  } catch {
    return null
  }
}

function setLastRead(userId: string, kind: 'job' | 'thread', id: string) {
  try {
    localStorage.setItem(readKey(userId, kind, id), new Date().toISOString())
  } catch {}
}

export async function markJobRead(jobId: string, userId: string) {
  setLastRead(userId, 'job', jobId)
}

export async function markThreadRead(threadId: string, userId: string) {
  setLastRead(userId, 'thread', threadId)
}

// Given a set of jobs a user is involved in, returns the ids of the ones
// with at least one message from someone else sent after that user's
// last read timestamp for that job (or any message at all if never read).
export async function getUnreadJobIds(jobIds: string[], userId: string): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set()

  const { data: messages, error } = await supabase
    .from('messages')
    .select('job_id, sender_user_id, created_at')
    .in('job_id', jobIds)
    .neq('sender_user_id', userId)

  if (error) {
    console.error('getUnreadJobIds: could not load messages', error)
    return new Set()
  }

  const unread = new Set<string>()
  for (const m of messages || []) {
    const lastRead = getLastRead(userId, 'job', m.job_id)
    if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
      unread.add(m.job_id)
    }
  }

  return unread
}

export async function getUnreadThreadIds(threadIds: string[], userId: string): Promise<Set<string>> {
  if (threadIds.length === 0) return new Set()

  const { data: messages, error } = await supabase
    .from('messages')
    .select('thread_id, sender_user_id, created_at')
    .in('thread_id', threadIds)
    .neq('sender_user_id', userId)

  if (error) {
    console.error('getUnreadThreadIds: could not load messages', error)
    return new Set()
  }

  const unread = new Set<string>()
  for (const m of messages || []) {
    const lastRead = getLastRead(userId, 'thread', m.thread_id)
    if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
      unread.add(m.thread_id)
    }
  }

  return unread
}
