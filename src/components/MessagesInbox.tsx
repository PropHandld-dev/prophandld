'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Skeleton } from '@/components/Skeleton'
import { UnreadDot } from '@/components/UnreadDot'
import { useConversations } from '@/lib/useConversations'
import { DmContactsStrip } from '@/components/DmContactsStrip'
import type { StartedConversation } from '@/lib/dmThreads'

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  const isToday = date.toDateString() === new Date().toDateString()
  if (isToday) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function MessagesInbox({ basePath }: { basePath: string }) {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const myRole = basePath.replace('/', '') as 'landlord' | 'renter' | 'contractor'

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [])

  const { loading, conversations, unreadIds } = useConversations(userId)

  const handleStarted = (c: StartedConversation) => {
    // The draft prefill (e.g. the rehire starter message) can't travel
    // through a full page navigation as component state, so stash it
    // for the thread page to pick up on mount.
    if (c.initialDraft) sessionStorage.setItem(`dm-draft:${c.threadId}`, c.initialDraft)
    router.push(`${basePath}/messages/${c.threadId}`)
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <DmContactsStrip myRole={myRole} onStart={handleStarted} onSeeAll={() => router.push(`${basePath}/messages/new`)} />
      {conversations.length === 0 && (
        <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
          <p className="text-white/50 text-sm">No conversations yet. Start one, or messages on a job will show up here.</p>
        </div>
      )}
      {conversations.map((c) => {
        const isMine = c.lastSenderId === userId
        const isUnread = unreadIds.has(`${c.kind}:${c.id}`)
        return (
          <Link
            key={`${c.kind}:${c.id}`}
            href={c.kind === 'job' ? `${basePath}/jobs/${c.id}/chat` : `${basePath}/messages/${c.id}`}
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
                <p className="text-white/60 text-xs truncate">{c.category}{c.propertyLabel ? ` · ${c.propertyLabel}` : ''}</p>
                <p className={`text-sm truncate mt-1 ${isUnread ? 'text-white font-medium' : 'text-white/50'}`}>
                  {isMine ? 'You: ' : ''}{c.lastMessage}
                </p>
              </div>
              <span className="text-white/50 text-xs shrink-0">{formatTimestamp(c.lastMessageAt)}</span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
