'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { mergedLastRead } from '@/lib/messageReads'

// Is there any conversation with a message from someone else that this
// person hasn't read? One small query on load, then a cheap re-check every
// 45 seconds while the tab is visible and whenever it regains focus. (A
// live subscription to every message was tried before and cost far more.)
export function useUnreadMessages(userId: string | null) {
  const [unread, setUnread] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const check = async () => {
      const { data } = await supabase
        .from('messages')
        .select('job_id, thread_id, created_at')
        .neq('sender_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(80)
      if (cancelled || !data) return

      const latestJob = new Map<string, string>()
      const latestThread = new Map<string, string>()
      for (const m of data as any[]) {
        if (m.job_id && !latestJob.has(m.job_id)) latestJob.set(m.job_id, m.created_at)
        if (m.thread_id && !latestThread.has(m.thread_id)) latestThread.set(m.thread_id, m.created_at)
      }

      const [jobReads, threadReads] = await Promise.all([
        latestJob.size ? mergedLastRead(userId, 'job', Array.from(latestJob.keys())) : Promise.resolve(new Map<string, string>()),
        latestThread.size ? mergedLastRead(userId, 'thread', Array.from(latestThread.keys())) : Promise.resolve(new Map<string, string>()),
      ])
      if (cancelled) return

      const isUnread = (latest: string, read?: string) => !read || new Date(latest) > new Date(read)
      const any =
        Array.from(latestJob).some(([id, latest]) => isUnread(latest, jobReads.get(id))) ||
        Array.from(latestThread).some(([id, latest]) => isUnread(latest, threadReads.get(id)))
      setUnread(any)
    }

    check()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') check()
    }, 45000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId])

  return unread
}
