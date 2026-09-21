'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Skeleton } from '@/components/Skeleton'
import { RippleButton } from '@/components/RippleButton'
import { markJobRead, markThreadRead } from '@/lib/messageReads'
import { CalendarIcon, WrenchIcon } from '@/components/icons'

type Message = {
  id: string
  job_id: string | null
  thread_id: string | null
  sender_user_id: string
  body: string
  created_at: string
}

type Participant = { role: string; user_id: string; full_name: string | null }

const ROLE_LABELS: Record<string, string> = {
  landlord: 'Landlord',
  renter: 'Renter',
  contractor: 'Contractor',
  admin: 'Prophandld team',
}

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  const isToday = date.toDateString() === new Date().toDateString()
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (isToday) return time
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${time}`
}

function dayLabel(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

export function ChatPanel({
  jobId,
  threadId,
  heightClassName = 'h-[70vh]',
  initialDraft = '',
  onRead,
}: {
  jobId?: string
  threadId?: string
  heightClassName?: string
  initialDraft?: string
  onRead?: () => void
}) {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(initialDraft)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<Message[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const markRead = async (uid: string) => {
    await (jobId ? markJobRead(jobId, uid) : threadId ? markThreadRead(threadId, uid) : Promise.resolve())
    onRead?.()
  }

  useEffect(() => {
    const buildMessagesQuery = () =>
      jobId
        ? supabase.from('messages').select('id, job_id, thread_id, sender_user_id, body, created_at').eq('job_id', jobId).order('created_at', { ascending: true })
        : supabase.from('messages').select('id, job_id, thread_id, sender_user_id, body, created_at').eq('thread_id', threadId).order('created_at', { ascending: true })
    let currentUserId: string | null = null

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      currentUserId = user.id
      setUserId(user.id)

      // Names come from the server (it knows who is in the conversation);
      // the old database function is only a fallback if that call fails.
      const participantsQuery = fetch(`/api/chat/participants?${jobId ? `jobId=${jobId}` : `threadId=${threadId}`}`)
        .then(async (res) => {
          if (!res.ok) throw new Error('participants request failed')
          const body = await res.json()
          return { data: (body.participants || []) as Participant[] }
        })
        .catch(async () => {
          const fallback = jobId
            ? await supabase.rpc('get_job_participants', { target_job_id: jobId })
            : await supabase.rpc('get_dm_thread_participants', { target_thread_id: threadId })
          return { data: (fallback.data || []) as Participant[] }
        })
      const messagesQuery = buildMessagesQuery()

      const [{ data: participantsData }, { data: messagesData, error: loadError }] = await Promise.all([
        participantsQuery,
        messagesQuery,
      ])

      setParticipants(participantsData || [])

      if (loadError) {
        console.error('Error loading messages:', loadError)
        setError('Could not load messages.')
        setLoading(false)
        return
      }

      setMessages(messagesData || [])
      setLoading(false)
      await markRead(user.id)
    }
    init()

    const filter = jobId ? `job_id=eq.${jobId}` : `thread_id=eq.${threadId}`
    const channel = supabase
      .channel(`messages:${jobId ? 'job' : 'thread'}:${jobId || threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter },
        (payload) => {
          const incoming = payload.new as Message
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]))
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) markRead(user.id)
          })
        }
      )
      .subscribe()

    // Live updates can miss a message (a dropped connection, a phone that was
    // asleep), so quietly re-check the conversation while it is on screen.
    const refetch = async () => {
      if (document.visibilityState !== 'visible' || !currentUserId) return
      const { data } = await buildMessagesQuery()
      if (!data) return
      const known = new Set(messagesRef.current.map((m) => m.id))
      if (!data.some((m) => !known.has(m.id))) return
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        const fresh = data.filter((m) => !seen.has(m.id))
        return fresh.length === 0 ? prev : [...prev, ...fresh].sort((a, b) => a.created_at.localeCompare(b.created_at))
      })
      markRead(currentUserId)
    }
    const timer = setInterval(refetch, 10000)
    document.addEventListener('visibilitychange', refetch)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refetch)
      supabase.removeChannel(channel)
    }
  }, [jobId, threadId])

  // Keep the newest message in view by scrolling the chat itself, not the
  // whole page (scrollIntoView also dragged the page down to the chat).
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, loading])

  const participantByUserId = new Map(participants.map((p) => [p.user_id, p]))
  const others = participants.filter((p) => p.user_id !== userId)
  const myRole = participantByUserId.get(userId || '')?.role
  // Only a landlord messaging a contractor gets "Start a job" — that's
  // the one DM pairing where "let's schedule something" should really
  // mean a real job (photos, bidding, payment, disputes), not just a
  // time floating in chat with no context behind it. Every other DM
  // pairing keeps the lightweight "Propose a time" chat shortcut.
  const contractorInThread = threadId ? others.find((p) => p.role === 'contractor') : undefined
  const showStartJob = !!contractorInThread && myRole === 'landlord'

  const sendMessage = async (body: string, options?: { silent?: boolean }) => {
    if (!body.trim() || !userId) return false

    setSending(true)
    setError(null)

    const { data: inserted, error: insertError } = await supabase
      .from('messages')
      .insert(
        jobId
          ? { job_id: jobId, sender_user_id: userId, body: body.trim() }
          : { thread_id: threadId, sender_user_id: userId, body: body.trim() }
      )
      .select('id, job_id, thread_id, sender_user_id, body, created_at')
      .single()

    if (insertError) {
      console.error('Error sending message:', insertError)
      setError('Could not send message.')
      setSending(false)
      return false
    }

    // Append immediately rather than waiting on the realtime echo — the
    // duplicate guard in the realtime handler already no-ops if it also
    // arrives that way.
    if (inserted) {
      setMessages((prev) => (prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]))
      // Tell the other people in the chat (push, and an email for the first
      // message of a burst). Fire-and-forget: a failed alert never blocks the chat.
      // Scheduling shortcuts have their own email, so they skip this one.
      if (!options?.silent) {
        fetch('/api/chat/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: inserted.id }),
        }).catch((err) => console.error('Failed to send chat notification:', err))
      }
    }

    setSending(false)
    return true
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await sendMessage(draft)) setDraft('')
  }

  // DM threads only. Fire-and-forget: a failed email shouldn't block the chat itself.
  const notifySchedule = (text: string, kind: 'proposed' | 'confirmed') => {
    if (!threadId) return
    fetch('/api/dm-schedule-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, text, kind }),
    }).catch((err) => console.error('Failed to send schedule notification email:', err))
  }

  const handleSendSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scheduleDate) return
    const dt = new Date(`${scheduleDate}T${scheduleTime || '09:00'}`)
    const formatted = dt.toLocaleString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    const text = `📅 Proposed time: ${formatted}${scheduleTime ? '' : ' (time TBD)'}`
    if (await sendMessage(text, { silent: true })) {
      setShowSchedule(false)
      setScheduleDate('')
      setScheduleTime('')
      notifySchedule(text, 'proposed')
    }
  }

  const handleConfirmSchedule = async (proposalBody: string) => {
    const timePart = proposalBody.replace('📅 Proposed time: ', '')
    const text = `✅ Confirmed: ${timePart}`
    if (await sendMessage(text, { silent: true })) notifySchedule(text, 'confirmed')
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 mb-2" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-14" />
      </div>
    )
  }

  let lastDay = ''

  return (
    <div className={`flex flex-col ${heightClassName}`}>
      {others.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pb-3 mb-3 border-b border-white/8">
          <span className="text-white/60 text-xs">With</span>
          {others.map((p) => (
            <span key={p.user_id} className="inline-flex items-center gap-1 text-xs bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
              <span className="text-white font-medium">{p.full_name || 'Unknown'}</span>
              {ROLE_LABELS[p.role] && <span className="text-white/60">· {ROLE_LABELS[p.role]}</span>}
            </span>
          ))}
        </div>
      )}

      <div ref={listRef} className="flex-1 overflow-y-auto space-y-1 pb-4 pr-3">
        {messages.length === 0 ? (
          <p className="text-white/50 text-sm text-center py-10">No messages yet. Say hello.</p>
        ) : (
          messages.map((m, i) => {
            const isMine = m.sender_user_id === userId
            const sender = participantByUserId.get(m.sender_user_id)
            const thisDay = dayLabel(m.created_at)
            const showDayDivider = thisDay !== lastDay
            lastDay = thisDay

            const isProposal = threadId && m.body.startsWith('📅 Proposed time: ')
            const alreadyConfirmed = isProposal && messages.slice(i + 1).some((later) => later.sender_user_id === userId && later.body.startsWith('✅ Confirmed:'))
            const canConfirm = isProposal && !isMine && !alreadyConfirmed

            return (
              <div key={m.id}>
                {showDayDivider && (
                  <div className="flex items-center justify-center my-4">
                    <span className="text-white/50 text-[11px] font-medium bg-white/5 rounded-full px-3 py-1">{thisDay}</span>
                  </div>
                )}
                <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3`}>
                  <div className="max-w-[78%]">
                    <p className={`text-[11px] font-medium mb-1 ${isMine ? 'text-right text-white/60' : 'text-left text-white/50'}`}>
                      {isMine ? 'You' : [sender?.full_name || 'Someone', ROLE_LABELS[sender?.role || '']].filter(Boolean).join(' · ')}
                    </p>
                    <div
                      className={
                        isMine
                          ? 'bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white rounded-2xl rounded-br-sm px-4 py-2.5'
                          : 'bg-white/5 border border-white/10 text-white rounded-2xl rounded-bl-sm px-4 py-2.5'
                      }
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
                    </div>
                    <p className={`text-[10px] text-white/50 mt-1 ${isMine ? 'text-right' : 'text-left'}`}>
                      {formatTimestamp(m.created_at)}
                      {isMine && ' · ✓ Sent'}
                    </p>
                    {canConfirm && (
                      <button
                        onClick={() => handleConfirmSchedule(m.body)}
                        disabled={sending}
                        className="mt-1.5 text-[#12A5A9] text-xs font-semibold bg-[#12A5A9]/10 hover:bg-[#12A5A9]/15 rounded-full px-3 py-1.5 transition disabled:opacity-50"
                      >
                        ✓ Confirm this time
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-3">
          {error}
        </div>
      )}

      {threadId && !showStartJob && showSchedule && (
        <form onSubmit={handleSendSchedule} className="bg-white/5 border border-white/10 rounded-xl p-3 mb-3 space-y-2">
          <p className="text-white/50 text-xs font-medium">Propose a time</p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              required
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#12A5A9] transition [color-scheme:dark]"
            />
            <input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#12A5A9] transition [color-scheme:dark]"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={sending || !scheduleDate}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold rounded-lg px-3.5 py-2 disabled:opacity-50 transition"
            >
              Send proposal
            </button>
            <button type="button" onClick={() => setShowSchedule(false)} className="text-white/60 hover:text-white text-xs transition">
              Cancel
            </button>
          </div>
        </form>
      )}

      <form onSubmit={handleSend} className="flex items-center gap-2 pt-2 border-t border-white/8">
        {threadId && showStartJob && (
          <button
            type="button"
            onClick={() => router.push(`/landlord/messages/${threadId}/new-job`)}
            aria-label="Start a job"
            title="Start a job"
            className="shrink-0 w-11 h-11 rounded-xl border bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-[#12A5A9]/40 flex items-center justify-center transition"
          >
            <WrenchIcon className="w-4.5 h-4.5" />
          </button>
        )}
        {threadId && !showStartJob && (
          <button
            type="button"
            onClick={() => setShowSchedule((v) => !v)}
            aria-label="Propose a time"
            className={`shrink-0 w-11 h-11 rounded-xl border flex items-center justify-center transition ${
              showSchedule ? 'bg-[#12A5A9]/20 border-[#12A5A9]/40 text-[#12A5A9]' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
            }`}
          >
            <CalendarIcon className="w-4.5 h-4.5" />
          </button>
        )}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
        />
        <RippleButton
          type="submit"
          disabled={sending || !draft.trim()}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-5 py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50 shrink-0"
        >
          Send
        </RippleButton>
      </form>
    </div>
  )
}
