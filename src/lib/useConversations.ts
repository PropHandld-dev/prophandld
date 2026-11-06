'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { mergedLastRead } from '@/lib/messageReads'
import { useLanguage, t, roleLabel } from '@/lib/i18n'

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

// Participants and job labels almost never change, so they're looked up
// once per conversation and reused. Before this, every reload (each new
// message, tab focus and a 25s timer, on every page) re-ran one request
// per conversation.
const CACHE_TTL_MS = 5 * 60 * 1000
type Cached<T> = { at: number; value: T }
const participantsCache = new Map<string, Cached<{ role: string; user_id: string; full_name: string | null }[]>>()
const jobLabelCache = new Map<string, Cached<any>>()

function fresh<T>(entry: Cached<T> | undefined): entry is Cached<T> {
  return !!entry && Date.now() - entry.at < CACHE_TTL_MS
}

// Shared by the full-page inbox and the floating widget. Used to rely
// entirely on the `messages` table's own RLS policy to scope
// get_recent_conversation_previews() to real participants — proven wrong
// by the same external audit that found the single-thread fetch had the
// identical gap (see /api/chat/inbox-previews, which this now calls
// instead of hitting the RPC directly). The authorization now actually
// lives there, re-checked per conversation via loadChatParticipants.
export function useConversations(userId: string | null) {
  const lang = useLanguage()
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

    // One row per conversation (the latest message in it), computed in the
    // database rather than a JS-side cap on the N most recent messages
    // globally — see get_recent_conversation_previews for why that matters.
    //
    // Goes through /api/chat/inbox-previews rather than calling the RPC
    // directly — caught live by an external audit (2026-11-06): calling
    // it straight from here trusted its rows completely, on the same
    // since-disproven assumption that `messages`' own RLS policy already
    // restricts them to real participants. That route re-checks every row
    // against loadChatParticipants (the same authorization helper the
    // single-thread fetch already uses) before this ever sees it, so a
    // non-member's conversation can no longer surface here, in search, or
    // in unread counts, all of which are derived from this one list.
    const res = await fetch('/api/chat/inbox-previews').catch(() => null)
    if (!res?.ok) {
      console.error('Error loading messages:', res ? await res.json().catch(() => ({})) : 'network error')
      setLoading(false)
      return
    }
    const { previews } = await res.json().catch(() => ({ previews: [] }))

    const entries = ((previews || []) as { kind: 'job' | 'dm'; conv_id: string; body: string; created_at: string; sender_user_id: string }[])
      .map((m) => ({ kind: m.kind, id: m.conv_id, body: m.body, created_at: m.created_at, sender_user_id: m.sender_user_id }))
    if (entries.length === 0) {
      setConversations([])
      setUnreadIds(new Set())
      setLoading(false)
      return
    }

    const jobIds = entries.filter((e) => e.kind === 'job').map((e) => e.id)
    const threadIds = entries.filter((e) => e.kind === 'dm').map((e) => e.id)

    // Blocking is the only reason a DM conversation this user is a real
    // participant in should ever disappear from their own inbox — fetched
    // once per load rather than per-thread since it's one small list.
    const blockedUserIds = await fetch('/api/messages/block')
      .then((res) => res.json())
      .then((data) => new Set<string>(data.blockedUserIds || []))
      .catch(() => new Set<string>())

    const missingJobIds = jobIds.filter((id) => !fresh(jobLabelCache.get(id)))
    const missingParticipantKeys = [
      ...jobIds.filter((id) => !fresh(participantsCache.get(`job:${id}`))).map((id) => ({ kind: 'job' as const, id })),
      ...threadIds.filter((id) => !fresh(participantsCache.get(`dm:${id}`))).map((id) => ({ kind: 'dm' as const, id })),
    ]

    const [jobsResult, jobReads, threadReads, participantResults] = await Promise.all([
      missingJobIds.length > 0
        ? supabase.from('jobs').select('id, category, units(unit_number, properties(address))').in('id', missingJobIds)
        : Promise.resolve({ data: [] as any[] }),
      jobIds.length > 0 ? mergedLastRead(userId, 'job', jobIds) : Promise.resolve(new Map<string, string>()),
      threadIds.length > 0 ? mergedLastRead(userId, 'thread', threadIds) : Promise.resolve(new Map<string, string>()),
      Promise.all(
        missingParticipantKeys.map((k) =>
          k.kind === 'job'
            ? supabase.rpc('get_job_participants', { target_job_id: k.id })
            : supabase.rpc('get_dm_thread_participants', { target_thread_id: k.id })
        )
      ),
    ])

    for (const job of jobsResult.data || []) jobLabelCache.set(job.id, { at: Date.now(), value: job })
    missingParticipantKeys.forEach((k, i) => {
      const result = participantResults[i]
      if (result?.error) {
        console.error('useConversations: participants lookup failed', { ...k, error: result.error })
        return
      }
      // Empty results (e.g. no contractor selected yet) aren't cached, so
      // a participant who joins later shows up on the next reload.
      const data = (result?.data || []) as any[]
      if (data.length > 0) participantsCache.set(`${k.kind}:${k.id}`, { at: Date.now(), value: data })
    })

    // Unread is worked out from the one-per-conversation previews already
    // loaded above, instead of two more queries that pulled every message
    // from other people. A conversation's latest message is enough to know
    // whether it's unread: if it's from someone else and after the last
    // time this conversation was read, it's unread regardless of what came
    // before it, since reading a conversation always covers everything in
    // it up to that point.
    const unread = new Set<string>()
    for (const e of entries) {
      if (e.sender_user_id === userId) continue
      const isJob = e.kind === 'job'
      const lastRead = (isJob ? jobReads : threadReads).get(e.id)
      if (!lastRead || new Date(e.created_at) > new Date(lastRead)) unread.add(`${isJob ? 'job' : 'thread'}:${e.id}`)
    }
    setUnreadIds(unread)

    const jobById = new Map(jobIds.map((id) => [id, jobLabelCache.get(id)?.value]))
    const jobParticipantsById = new Map(jobIds.map((id) => [id, { data: participantsCache.get(`job:${id}`)?.value ?? [], error: null as any }]))
    const dmParticipantsById = new Map(threadIds.map((id) => [id, { data: participantsCache.get(`dm:${id}`)?.value ?? [], error: null as any }]))

    const visibleEntries = blockedUserIds.size === 0 ? entries : entries.filter((e) => {
      if (e.kind !== 'dm') return true
      const participants = (dmParticipantsById.get(e.id)?.data || []) as { user_id: string }[]
      return !participants.some((p) => p.user_id !== userId && blockedUserIds.has(p.user_id))
    })

    const list: Conversation[] = visibleEntries.map((e) => {
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
          ? others.map((p) => p.full_name || t('unknownName', lang)).join(', ')
          : (job?.category || t('thisJobLabel', lang))
        const otherRole = others[0]?.role ? roleLabel(others[0].role, lang) : ''

        return {
          kind: 'job' as const,
          id: e.id,
          lastMessage: e.body,
          lastMessageAt: e.created_at,
          lastSenderId: e.sender_user_id,
          category: job?.category || t('jobLabel', lang),
          propertyLabel: property?.address
            ? `${property.address}${unit?.unit_number ? `, Unit ${unit.unit_number}` : ''}`
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
      const otherLabel = others.length > 0 ? others.map((p) => p.full_name || t('unknownName', lang)).join(', ') : t('directMessageLabel', lang)
      const otherRole = others[0]?.role ? roleLabel(others[0].role, lang) : ''

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

    // Caught live by an external audit: this relied entirely on
    // get_recent_conversation_previews's own row order, with no
    // guarantee enforced client-side — sorting explicitly here is what
    // actually promises "most recent conversation first," regardless of
    // what the RPC does internally.
    list.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())

    setConversations(list)
    setLoading(false)
  }, [userId, lang])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!userId) return
    let debounce: ReturnType<typeof setTimeout> | null = null
    const channel = supabase
      .channel(`inbox:${userId}:${instanceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(load, 600)
      })
      .subscribe()
    return () => {
      if (debounce) clearTimeout(debounce)
      supabase.removeChannel(channel)
    }
  }, [userId, load])

  // Confirmed live (2026-10-06): the postgres_changes INSERT event this
  // channel subscribes to doesn't actually reach an already-open tab (same
  // gap as ChatPanel/useJobRealtime). This poll is the real delivery
  // mechanism for new-message badges right now, not just a rare safety
  // net, hence 15s rather than a true fallback's longer interval.
  useEffect(() => {
    if (!userId) return
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 15000)
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
