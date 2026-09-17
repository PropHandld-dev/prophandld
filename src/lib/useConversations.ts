'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getUnreadJobIds, getUnreadThreadIds } from '@/lib/messageReads'

export type Conversation = {
  kind: 'job' | 'dm'
  id: string
  lastMessage: string
  lastMessageAt: string
  lastSenderId: string
  category: string
  propertyLabel: string
  otherName: string
  otherRole: string
}

const ROLE_LABELS: Record<string, string> = {
  landlord: 'Landlord',
  renter: 'Renter',
  contractor: 'Contractor',
}

// Shared by the full-page inbox and the floating widget. Deliberately
// has no server-side "who can you message" logic of its own — it only
// ever surfaces conversations that already exist. A job conversation
// can only exist because someone inserted a message, which the
// `messages` RLS policy restricts to actual job participants (see
// is_job_participant). A DM conversation can only exist because a
// `dm_threads` row was created by start_landlord_tenant_thread /
// start_landlord_contractor_thread, both of which independently
// re-derive the relationship from real tenancy/bid rows — never an
// open contact list. Querying "all messages, most recent first" and
// grouping by job_id/thread_id client-side is safe precisely because
// RLS has already filtered the rows to conversations this user is
// legitimately part of.
export function useConversations(userId: string | null) {
  const [loading, setLoading] = useState(true)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set())
  // FloatingChatWidget and MessagesInbox both call this hook, sometimes
  // simultaneously (the widget's effects don't stop just because it
  // renders null on /messages routes) — a shared channel name per user
  // collides the moment a second instance tries to subscribe, so each
  // hook instance gets its own unique channel.
  const instanceId = useRef(Math.random().toString(36).slice(2)).current

  const load = useCallback(async () => {
    if (!userId) return

    const { data: messages, error } = await supabase
      .from('messages')
      .select('job_id, thread_id, body, created_at, sender_user_id')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading messages:', error)
      setLoading(false)
      return
    }

    const latestByKey = new Map<string, { kind: 'job' | 'dm'; id: string; body: string; created_at: string; sender_user_id: string }>()
    for (const m of messages || []) {
      const kind: 'job' | 'dm' = m.job_id ? 'job' : 'dm'
      const id = m.job_id || m.thread_id!
      const key = `${kind}:${id}`
      if (!latestByKey.has(key)) latestByKey.set(key, { kind, id, body: m.body, created_at: m.created_at, sender_user_id: m.sender_user_id })
    }

    const entries = Array.from(latestByKey.values())
    if (entries.length === 0) {
      setConversations([])
      setUnreadIds(new Set())
      setLoading(false)
      return
    }

    const jobIds = entries.filter((e) => e.kind === 'job').map((e) => e.id)
    const threadIds = entries.filter((e) => e.kind === 'dm').map((e) => e.id)

    const [{ data: jobsData }, unreadJobs, unreadThreads, jobParticipantResults, dmParticipantResults] = await Promise.all([
      jobIds.length > 0
        ? supabase.from('jobs').select('id, category, units(unit_number, properties(address))').in('id', jobIds)
        : Promise.resolve({ data: [] as any[] }),
      getUnreadJobIds(jobIds, userId),
      getUnreadThreadIds(threadIds, userId),
      Promise.all(jobIds.map((jobId) => supabase.rpc('get_job_participants', { target_job_id: jobId }))),
      Promise.all(threadIds.map((threadId) => supabase.rpc('get_dm_thread_participants', { target_thread_id: threadId }))),
    ])

    setUnreadIds(new Set([...Array.from(unreadJobs, (id) => `job:${id}`), ...Array.from(unreadThreads, (id) => `thread:${id}`)]))

    const jobById = new Map((jobsData || []).map((j) => [j.id, j]))
    const jobParticipantsById = new Map(jobIds.map((id, i) => [id, jobParticipantResults[i]]))
    const dmParticipantsById = new Map(threadIds.map((id, i) => [id, dmParticipantResults[i]]))

    const list: Conversation[] = entries.map((e) => {
      if (e.kind === 'job') {
        const job = jobById.get(e.id) as any
        const unit = job?.units
        const property = unit?.properties
        const result = jobParticipantsById.get(e.id)

        if (result?.error) {
          console.error('useConversations: get_job_participants failed', { jobId: e.id, error: result.error })
        }

        const participants = (result?.data || []) as { role: string; user_id: string; full_name: string | null }[]
        const others = participants.filter((p) => p.user_id !== userId)
        // Falls back to job context (not a bare "Someone") when the RPC
        // can't resolve another participant — e.g. a job with no accepted
        // contractor yet, or the SQL grant for this RPC hasn't been run.
        const otherLabel = others.length > 0
          ? others.map((p) => p.full_name || 'Unknown').join(', ')
          : (job?.category || 'This job')
        const otherRole = others[0]?.role ? ROLE_LABELS[others[0].role] || others[0].role : ''

        return {
          kind: 'job' as const,
          id: e.id,
          lastMessage: e.body,
          lastMessageAt: e.created_at,
          lastSenderId: e.sender_user_id,
          category: job?.category || 'Job',
          propertyLabel: property?.address
            ? `${property.address}${unit?.unit_number ? ` — Unit ${unit.unit_number}` : ''}`
            : '',
          otherName: otherLabel,
          otherRole,
        }
      }

      const result = dmParticipantsById.get(e.id)
      if (result?.error) {
        console.error('useConversations: get_dm_thread_participants failed', { threadId: e.id, error: result.error })
      }
      const participants = (result?.data || []) as { role: string; user_id: string; full_name: string | null }[]
      const others = participants.filter((p) => p.user_id !== userId)
      const otherLabel = others.length > 0 ? others.map((p) => p.full_name || 'Unknown').join(', ') : 'Direct message'
      const otherRole = others[0]?.role ? ROLE_LABELS[others[0].role] || others[0].role : ''

      return {
        kind: 'dm' as const,
        id: e.id,
        lastMessage: e.body,
        lastMessageAt: e.created_at,
        lastSenderId: e.sender_user_id,
        category: 'Direct message',
        propertyLabel: '',
        otherName: otherLabel,
        otherRole,
      }
    })

    setConversations(list)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`inbox:${userId}:${instanceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, load])

  // Safety net alongside realtime — polls every 25s and refreshes the
  // instant the tab regains focus, so a missed/delayed realtime event
  // (or a badge left stale from another device) self-corrects without
  // requiring a manual page reload.
  useEffect(() => {
    if (!userId) return
    const interval = setInterval(load, 25000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId, load])

  const totalUnread = unreadIds.size

  return { loading, conversations, unreadIds, totalUnread, refetch: load }
}
