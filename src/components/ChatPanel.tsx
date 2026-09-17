'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Skeleton } from '@/components/Skeleton'
import { RippleButton } from '@/components/RippleButton'
import { markJobRead, markThreadRead } from '@/lib/messageReads'
import { CalendarIcon } from '@/components/icons'

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
  const bottomRef = useRef<HTMLDivElement>(null)

  const markRead = async (uid: string) => {
    await (jobId ? markJobRead(jobId, uid) : threadId ? markThreadRead(threadId, uid) : Promise.resolve())
    onRead?.()
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const participantsQuery = jobId
        ? supabase.rpc('get_job_participants', { target_job_id: jobId })
        : supabase.rpc('get_dm_thread_participants', { target_thread_id: threadId })
      const messagesQuery = jobId
        ? supabase.from('messages').select('id, job_id, thread_id, sender_user_id, body, created_at').eq('job_id', jobId).order('created_at', { ascending: true })
        : supabase.from('messages').select('id, job_id, thread_id, sender_user_id, body, created_at').eq('thread_id', threadId).order('created_at', { ascending: true })

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

    return () => {
      supabase.removeChannel(channel)
    }
  }, [jobId, threadId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const participantByUserId = new Map(participants.map((p) => [p.user_id, p]))
  const others = participants.filter((p) => p.user_id !== userId)

  const sendMessage = async (body: string) => {
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
    }

    setSending(false)
    return true
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await sendMessage(draft)) setDraft('')
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
    if (await sendMessage(`📅 Proposed time: ${formatted}${scheduleTime ? '' : ' (time TBD)'}`)) {
      setShowSchedule(false)
      setScheduleDate('')
      setScheduleTime('')
    }
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
          <span className="text-white/40 text-xs">With</span>
          {others.map((p) => (
            <span key={p.user_id} className="inline-flex items-center gap-1 text-xs bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
              <span className="text-white font-medium">{p.full_name || 'Unknown'}</span>
              <span className="text-white/40">· {ROLE_LABELS[p.role] || p.role}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-1 pb-4">
        {messages.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-10">No messages yet — say hello.</p>
        ) : (
          messages.map((m) => {
            const isMine = m.sender_user_id === userId
            const sender = participantByUserId.get(m.sender_user_id)
            const thisDay = dayLabel(m.created_at)
            const showDayDivider = thisDay !== lastDay
            lastDay = thisDay

            return (
              <div key={m.id}>
                {showDayDivider && (
                  <div className="flex items-center justify-center my-4">
                    <span className="text-white/30 text-[11px] font-medium bg-white/5 rounded-full px-3 py-1">{thisDay}</span>
                  </div>
                )}
                <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3`}>
                  <div className="max-w-[78%]">
                    <p className={`text-[11px] font-medium mb-1 ${isMine ? 'text-right text-white/40' : 'text-left text-white/50'}`}>
                      {isMine ? 'You' : `${sender?.full_name || 'Someone'} · ${ROLE_LABELS[sender?.role || ''] || 'Unknown'}`}
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
                    <p className={`text-[10px] text-white/30 mt-1 ${isMine ? 'text-right' : 'text-left'}`}>
                      {formatTimestamp(m.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-3">
          {error}
        </div>
      )}

      {threadId && showSchedule && (
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
            <button type="button" onClick={() => setShowSchedule(false)} className="text-white/40 hover:text-white text-xs transition">
              Cancel
            </button>
          </div>
        </form>
      )}

      <form onSubmit={handleSend} className="flex items-center gap-2 pt-2 border-t border-white/8">
        {threadId && (
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
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
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
