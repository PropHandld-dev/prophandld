'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getUnreadJobIds } from '@/lib/messageReads'

export type Conversation = {
  jobId: string
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
// ever surfaces conversations that already exist, and a conversation
// can only exist because someone inserted a message, which the
// `messages` RLS policy already restricts to actual job participants
// (see is_job_participant: landlord via property ownership, renter via
// their own active tenancy, contractor via an accepted bid on that
// specific job — never an open contact list). Querying "all messages,
// most recent first" and grouping by job_id client-side is safe
// precisely because RLS has already filtered the rows to jobs this
// user is legitimately part of.
export function useConversations(userId: string | null) {
  const [loading, setLoading] = useState(true)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [unreadJobIds, setUnreadJobIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!userId) return

    const { data: messages, error } = await supabase
      .from('messages')
      .select('job_id, body, created_at, sender_user_id')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading messages:', error)
      setLoading(false)
      return
    }

    const latestByJob = new Map<string, { body: string; created_at: string; sender_user_id: string }>()
    for (const m of messages || []) {
      if (!latestByJob.has(m.job_id)) latestByJob.set(m.job_id, m)
    }

    const jobIds = Array.from(latestByJob.keys())
    if (jobIds.length === 0) {
      setConversations([])
      setLoading(false)
      return
    }

    const [{ data: jobsData }, unread] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, category, units(unit_number, properties(address))')
        .in('id', jobIds),
      getUnreadJobIds(jobIds, userId),
    ])

    setUnreadJobIds(unread)

    const jobById = new Map((jobsData || []).map((j) => [j.id, j]))

    const participantResults = await Promise.all(
      jobIds.map((jobId) => supabase.rpc('get_job_participants', { target_job_id: jobId }))
    )

    const list: Conversation[] = jobIds.map((jobId, i) => {
      const last = latestByJob.get(jobId)!
      const job = jobById.get(jobId) as any
      const unit = job?.units
      const property = unit?.properties

      if (participantResults[i].error) {
        console.error('useConversations: get_job_participants failed', { jobId, error: participantResults[i].error })
      }

      const participants = (participantResults[i].data || []) as { role: string; user_id: string; full_name: string | null }[]
      const others = participants.filter((p) => p.user_id !== userId)
      // Falls back to job context (not a bare "Someone") when the RPC
      // can't resolve another participant — e.g. a job with no accepted
      // contractor yet, or the SQL grant for this RPC hasn't been run.
      const otherLabel = others.length > 0
        ? others.map((p) => p.full_name || 'Unknown').join(', ')
        : (job?.category || 'This job')
      const otherRole = others[0]?.role ? ROLE_LABELS[others[0].role] || others[0].role : ''

      return {
        jobId,
        lastMessage: last.body,
        lastMessageAt: last.created_at,
        lastSenderId: last.sender_user_id,
        category: job?.category || 'Job',
        propertyLabel: property?.address
          ? `${property.address}${unit?.unit_number ? ` — Unit ${unit.unit_number}` : ''}`
          : '',
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
      .channel(`inbox:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, load])

  const totalUnread = unreadJobIds.size

  return { loading, conversations, unreadJobIds, totalUnread, refetch: load }
}
