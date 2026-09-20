import { supabase } from '@/lib/supabase'

// Read state is dual-written: localStorage for a fast, no-round-trip
// check, and message_read_state for durability — it survives a browser
// clearing site storage (Safari's tracking-prevention does this more
// aggressively than other browsers, which is the likely cause of a
// badge reappearing after sign-out/sign-in with nothing else changed)
// and syncs across devices, which pure localStorage never could. The
// DB side was dropped once before over repeated "permission denied"
// failures — those were a missing table-level GRANT, not a schema
// problem, and got fixed broadly since. Reading takes whichever of the
// two timestamps is newer, so neither side is a single point of failure.
function readKey(userId: string, kind: 'job' | 'thread', id: string) {
  return `ph_read_${userId}_${kind}_${id}`
}

function getLocalLastRead(userId: string, kind: 'job' | 'thread', id: string): string | null {
  try {
    return localStorage.getItem(readKey(userId, kind, id))
  } catch {
    return null
  }
}

function setLocalLastRead(userId: string, kind: 'job' | 'thread', id: string, iso: string) {
  try {
    localStorage.setItem(readKey(userId, kind, id), iso)
  } catch {}
}

async function setLastRead(userId: string, kind: 'job' | 'thread', id: string) {
  const iso = new Date().toISOString()
  setLocalLastRead(userId, kind, id, iso)

  const { error } = await supabase
    .from('message_read_state')
    .upsert(
      {
        user_id: userId,
        job_id: kind === 'job' ? id : null,
        thread_id: kind === 'thread' ? id : null,
        last_read_at: iso,
      },
      { onConflict: kind === 'job' ? 'user_id,job_id' : 'user_id,thread_id' }
    )

  if (error) {
    // localStorage already has it — this just means cross-device sync
    // won't happen for this one, not a broken read receipt.
    console.error('setLastRead: DB write failed, localStorage still updated', { kind, id, error })
  }
}

export async function markJobRead(jobId: string, userId: string) {
  await setLastRead(userId, 'job', jobId)
}

export async function markThreadRead(threadId: string, userId: string) {
  await setLastRead(userId, 'thread', threadId)
}

// Merges local and remote last-read timestamps for a batch of
// conversations, taking whichever is newer per conversation.
export async function mergedLastRead(
  userId: string,
  kind: 'job' | 'thread',
  ids: string[]
): Promise<Map<string, string>> {
  const merged = new Map<string, string>()

  for (const id of ids) {
    const local = getLocalLastRead(userId, kind, id)
    if (local) merged.set(id, local)
  }

  const column = kind === 'job' ? 'job_id' : 'thread_id'
  const { data, error } = await supabase
    .from('message_read_state')
    .select(`${column}, last_read_at`)
    .eq('user_id', userId)
    .in(column, ids)

  if (error) {
    console.error('mergedLastRead: DB read failed, falling back to localStorage only', { kind, error })
    return merged
  }

  for (const row of (data || []) as any[]) {
    const id = row[column]
    const remote = row.last_read_at as string
    const existing = merged.get(id)
    if (!existing || new Date(remote) > new Date(existing)) {
      merged.set(id, remote)
      // Backfill localStorage so the next check is a pure local hit.
      setLocalLastRead(userId, kind, id, remote)
    }
  }

  return merged
}

// Given a set of jobs a user is involved in, returns the ids of the ones
// with at least one message from someone else sent after that user's
// last read timestamp for that job (or any message at all if never read).
export async function getUnreadJobIds(jobIds: string[], userId: string): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set()

  const [{ data: messages, error }, lastReadByJob] = await Promise.all([
    supabase.from('messages').select('job_id, sender_user_id, created_at').in('job_id', jobIds).neq('sender_user_id', userId),
    mergedLastRead(userId, 'job', jobIds),
  ])

  if (error) {
    console.error('getUnreadJobIds: could not load messages', error)
    return new Set()
  }

  const unread = new Set<string>()
  for (const m of messages || []) {
    const lastRead = lastReadByJob.get(m.job_id)
    if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
      unread.add(m.job_id)
    }
  }

  return unread
}

export async function getUnreadThreadIds(threadIds: string[], userId: string): Promise<Set<string>> {
  if (threadIds.length === 0) return new Set()

  const [{ data: messages, error }, lastReadByThread] = await Promise.all([
    supabase.from('messages').select('thread_id, sender_user_id, created_at').in('thread_id', threadIds).neq('sender_user_id', userId),
    mergedLastRead(userId, 'thread', threadIds),
  ])

  if (error) {
    console.error('getUnreadThreadIds: could not load messages', error)
    return new Set()
  }

  const unread = new Set<string>()
  for (const m of messages || []) {
    const lastRead = lastReadByThread.get(m.thread_id)
    if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
      unread.add(m.thread_id)
    }
  }

  return unread
}
