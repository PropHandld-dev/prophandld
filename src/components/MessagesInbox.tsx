'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Skeleton } from '@/components/Skeleton'
import { UnreadDot } from '@/components/UnreadDot'
import { getUnreadJobIds } from '@/lib/messageReads'

type Conversation = {
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

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  const isToday = date.toDateString() === new Date().toDateString()
  if (isToday) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function MessagesInbox({ basePath }: { basePath: string }) {
  const [loading, setLoading] = useState(true)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [unreadJobIds, setUnreadJobIds] = useState<Set<string>>(new Set())
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      // RLS already scopes this to jobs the caller participates in —
      // the distinct set of job_ids here IS the conversation list.
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
        setLoading(false)
        return
      }

      const [{ data: jobsData }, unread] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, category, units(unit_number, properties(address))')
          .in('id', jobIds),
        getUnreadJobIds(jobIds, user.id),
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
        const participants = (participantResults[i].data || []) as { role: string; user_id: string; full_name: string | null }[]
        const others = participants.filter((p) => p.user_id !== user.id)
        const otherLabel = others.length > 0
          ? others.map((p) => p.full_name || 'Unknown').join(', ')
          : 'Someone'
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
    }
    init()
  }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
        <p className="text-white/30 text-sm">No conversations yet — messages you send or receive on a job will show up here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {conversations.map((c) => {
        const isMine = c.lastSenderId === userId
        const isUnread = unreadJobIds.has(c.jobId)
        return (
          <Link
            key={c.jobId}
            href={`${basePath}/jobs/${c.jobId}/chat`}
            className="block bg-white/3 border border-white/8 rounded-2xl p-4 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <p className="text-white font-medium text-sm truncate">{c.otherName}</p>
                  {c.otherRole && (
                    <span className="text-[10px] bg-white/8 text-white/50 rounded-full px-1.5 py-0.5 shrink-0">{c.otherRole}</span>
                  )}
                  {isUnread && <UnreadDot />}
                </div>
                <p className="text-white/40 text-xs truncate">{c.category}{c.propertyLabel ? ` · ${c.propertyLabel}` : ''}</p>
                <p className={`text-sm truncate mt-1 ${isUnread ? 'text-white font-medium' : 'text-white/50'}`}>
                  {isMine ? 'You: ' : ''}{c.lastMessage}
                </p>
              </div>
              <span className="text-white/30 text-xs shrink-0">{formatTimestamp(c.lastMessageAt)}</span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
