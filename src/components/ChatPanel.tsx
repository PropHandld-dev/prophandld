'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Skeleton } from '@/components/Skeleton'
import { RippleButton } from '@/components/RippleButton'
import { markJobRead, markThreadRead } from '@/lib/messageReads'
import { CalendarIcon, WrenchIcon } from '@/components/icons'
import { useLanguage, t, roleLabel, type Lang } from '@/lib/i18n'
import { useConfirm } from '@/lib/useConfirm'
import { AI_ASSIST_ENABLED } from '@/lib/aiAssist'

const REPORT_REASONS = ['harassment', 'spam', 'inappropriate', 'scam_or_fraud', 'other'] as const
const reportReasonLabelKey: Record<(typeof REPORT_REASONS)[number], Parameters<typeof t>[0]> = {
  harassment: 'reportReasonHarassment',
  spam: 'reportReasonSpam',
  inappropriate: 'reportReasonInappropriate',
  scam_or_fraud: 'reportReasonScam',
  other: 'reportReasonOther',
}

type Message = {
  id: string
  job_id: string | null
  thread_id: string | null
  sender_user_id: string
  body: string
  created_at: string
}

type Participant = { role: string; user_id: string; full_name: string | null }

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  const isToday = date.toDateString() === new Date().toDateString()
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (isToday) return time
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${time}`
}

function dayLabel(iso: string, lang: Lang) {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return t('todayLabel', lang)
  if (date.toDateString() === yesterday.toDateString()) return t('yesterdayLabel', lang)
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

// The schedule-proposal shortcut writes its time directly into the message
// body (there's no separate structured column for it), and other logic
// pattern-matches that body to detect a proposal/confirmation and to offer
// "Confirm this time". Anchoring on the emoji rather than the English words
// after it means that detection keeps working regardless of which language
// wrote the message — translating the visible words can never silently
// break the button a past or future message depends on.
const isProposalBody = (body: string) => body.startsWith('📅 ')
const isConfirmedBody = (body: string) => body.startsWith('✅ ')
const proposalTimePart = (body: string) => body.replace(/^📅[^:]*:\s*/, '')

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
  const lang = useLanguage()
  const [userId, setUserId] = useState<string | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(initialDraft)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  // Per-message, on tap only — see /api/translate for why this isn't
  // automatic. Cached here so tapping a message twice doesn't call the
  // API again; cleared implicitly whenever this component remounts for a
  // different conversation (new jobId/threadId), since it's keyed by
  // message id, not conversation.
  const [translations, setTranslations] = useState<Record<string, { loading: boolean; text?: string; error?: string }>>({})
  const handleTranslate = async (messageId: string, body: string) => {
    if (translations[messageId]?.text || translations[messageId]?.loading) return
    setTranslations((prev) => ({ ...prev, [messageId]: { loading: true } }))
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body, target: lang }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // The server's own error text (e.g. "Translation is not configured
        // yet") is a developer-facing fact about env var setup, not
        // something a renter/landlord/contractor can act on — always show
        // the same plain, translated message instead, regardless of which
        // specific reason the server gave.
        setTranslations((prev) => ({ ...prev, [messageId]: { loading: false, error: t('couldNotTranslateMessage', lang) } }))
        return
      }
      setTranslations((prev) => ({ ...prev, [messageId]: { loading: false, text: data.translated } }))
    } catch {
      setTranslations((prev) => ({ ...prev, [messageId]: { loading: false, error: t('couldNotTranslateMessage', lang) } }))
    }
  }
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const { confirm, ConfirmDialog } = useConfirm()
  const [blockStatus, setBlockStatus] = useState<{ blockedByMe: boolean; blockedMe: boolean } | null>(null)
  const [aiAvailable, setAiAvailable] = useState(false)
  const [showAiDraft, setShowAiDraft] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [smartReplies, setSmartReplies] = useState<string[]>([])
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState<(typeof REPORT_REASONS)[number]>('harassment')
  const [reportNote, setReportNote] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set())
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
        setError(t('couldNotLoadMessages', lang))
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

    // Confirmed live (2026-10-06, timed test with two open sessions): the
    // postgres_changes INSERT event for this table doesn't actually reach
    // an already-open tab — subscribes fine, never fires. This poll is the
    // real delivery mechanism right now, not just a rare safety net for a
    // dropped connection, hence the shorter interval than a true fallback
    // would need. See useJobRealtime.ts for the matching gap on jobs/bids.
    // This is the single highest-visibility case of that gap — two people
    // actively looking at the same open chat thread — so it gets a much
    // tighter interval than the inbox/job-list polls (useConversations.ts,
    // useJobRealtime.ts) that only affect an unread badge or a status
    // label, not an in-progress conversation.
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
    const timer = setInterval(refetch, 3000)
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

  // Quick-reply suggestions for whatever the other side just said — the
  // route itself returns [] whenever AI Assist isn't active for whichever
  // landlord is in this conversation, or when the last message is mine, so
  // this doesn't need its own per-landlord availability check. It does
  // still check the global flag first, though — this effect reruns on
  // every incoming message, the highest-frequency AI check in the app, so
  // skipping the fetch outright while the flag is off (rather than
  // relying on the route's own fast no-op) is the one most worth avoiding
  // entirely rather than just making cheap.
  const lastMessage = messages[messages.length - 1]
  useEffect(() => {
    setSmartReplies([])
    if (!AI_ASSIST_ENABLED || !lastMessage || !userId || lastMessage.sender_user_id === userId) return
    let cancelled = false
    fetch('/api/ai-assist/smart-replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, threadId }),
    })
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setSmartReplies(data.replies || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [lastMessage?.id, userId, jobId, threadId])

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

  // AI-drafted tenant communication only makes sense on a real 1:1 DM
  // between this landlord and one of their renters, never job chat (the
  // contractor's there too) and never a landlord-contractor DM.
  const renterInThread = threadId && others.length === 1 && others[0].role === 'renter' ? others[0] : undefined
  const showAiDraftBtn = !!renterInThread && myRole === 'landlord' && aiAvailable
  useEffect(() => {
    if (!AI_ASSIST_ENABLED || myRole !== 'landlord') return
    fetch('/api/ai-assist/status')
      .then((res) => res.json())
      .then((data) => setAiAvailable(data.enabled && (data.status === 'trialing' || data.status === 'active')))
      .catch(() => setAiAvailable(false))
  }, [myRole])

  const draftMessage = async (kind: 'late_rent' | 'access_notice' | 'renewal_offer') => {
    if (!renterInThread) return
    setDrafting(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-assist/draft-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renterUserId: renterInThread.user_id, kind }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('aiDraftFailed', lang))
        setDrafting(false)
        return
      }
      setDraft(data.draft)
      setShowAiDraft(false)
    } catch {
      setError(t('aiDraftFailed', lang))
    }
    setDrafting(false)
  }

  // Block is a DM-only concept (job chat is tied to an active job that
  // needs both sides communicating to function) and only makes sense for
  // a real 1:1 DM, which is the only shape start_landlord_tenant_thread /
  // start_landlord_contractor_thread ever create.
  const otherForBlock = threadId && others.length === 1 ? others[0] : undefined
  useEffect(() => {
    let cancelled = false
    const otherId = otherForBlock?.user_id
    Promise.resolve()
      .then(() => (otherId ? fetch(`/api/messages/block?otherUserId=${otherId}`).then((res) => res.json()) : null))
      .then((data) => {
        if (cancelled) return
        setBlockStatus(data ? { blockedByMe: !!data.blockedByMe, blockedMe: !!data.blockedMe } : null)
      })
      .catch(() => { if (!cancelled) setBlockStatus(null) })
    return () => { cancelled = true }
  }, [otherForBlock?.user_id])
  const isBlocked = !!blockStatus && (blockStatus.blockedByMe || blockStatus.blockedMe)

  const handleBlock = async () => {
    if (!otherForBlock) return
    const ok = await confirm({
      title: t('blockConfirmTitle', lang),
      body: t('blockConfirmBody', lang),
      confirmLabel: t('blockPersonBtn', lang),
      danger: true,
    })
    if (!ok) return
    const res = await fetch('/api/messages/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otherUserId: otherForBlock.user_id }),
    })
    if (res.ok) setBlockStatus({ blockedByMe: true, blockedMe: blockStatus?.blockedMe || false })
  }

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reportingMessageId) return
    const message = messages.find((m) => m.id === reportingMessageId)
    if (!message) return
    setReportSubmitting(true)
    setReportError(null)
    try {
      const res = await fetch('/api/messages/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: message.id,
          jobId: jobId || undefined,
          threadId: threadId || undefined,
          reportedUserId: message.sender_user_id,
          reason: reportReason,
          note: reportNote.trim() || undefined,
        }),
      })
      if (!res.ok) {
        setReportError(t('couldNotSubmitReport', lang))
        return
      }
      setReportedIds((prev) => new Set(prev).add(message.id))
      setReportingMessageId(null)
      setReportNote('')
      setReportReason('harassment')
    } catch {
      setReportError(t('couldNotSubmitReport', lang))
    } finally {
      setReportSubmitting(false)
    }
  }

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
      setError(t('couldNotSendMessage', lang))
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
          keepalive: true,
        }).catch((err) => console.error('Failed to send chat notification:', err))
      }
    }

    setSending(false)
    return true
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await sendMessage(draft)) {
      setDraft('')
      setSmartReplies([])
    }
  }

  // DM threads only. Fire-and-forget: a failed email shouldn't block the chat itself.
  const notifySchedule = (text: string, kind: 'proposed' | 'confirmed') => {
    if (!threadId) return
    fetch('/api/dm-schedule-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, text, kind }),
      keepalive: true,
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
    const text = `📅 ${t('proposedTimePrefix', lang)} ${formatted}${scheduleTime ? '' : ` ${t('timeTbd', lang)}`}`
    if (await sendMessage(text, { silent: true })) {
      setShowSchedule(false)
      setScheduleDate('')
      setScheduleTime('')
      notifySchedule(text, 'proposed')
    }
  }

  const handleConfirmSchedule = async (proposalBody: string) => {
    const timePart = proposalTimePart(proposalBody)
    const text = `✅ ${t('confirmedPrefix', lang)} ${timePart}`
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
        <div className="flex items-center justify-between gap-2 flex-wrap pb-3 mb-3 border-b border-white/8">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white/60 text-xs">{t('withLabel', lang)}</span>
            {others.map((p) => (
              <span key={p.user_id} className="inline-flex items-center gap-1 text-xs bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
                <span className="text-white font-medium">{p.full_name || t('unknownPerson', lang)}</span>
                {p.role && <span className="text-white/60">· {roleLabel(p.role, lang)}</span>}
              </span>
            ))}
          </div>
          {otherForBlock && !isBlocked && (
            <button onClick={handleBlock} className="text-white/40 hover:text-red-400 text-xs font-medium transition shrink-0">
              {t('blockPersonBtn', lang)}
            </button>
          )}
        </div>
      )}
      {ConfirmDialog}

      {/* No edit/delete action on any message, deliberately: job chat and DMs
          are the audit trail if a fair-housing or maintenance dispute ever
          goes legal, so the raw history has to stay provable as unedited.
          Don't add one without checking with the team first. */}
      <div ref={listRef} className="flex-1 overflow-y-auto space-y-1 pb-4 pr-3">
        {messages.length === 0 ? (
          <p className="text-white/50 text-sm text-center py-10">{t('noMessagesYet', lang)}</p>
        ) : (
          messages.map((m, i) => {
            const isMine = m.sender_user_id === userId
            const sender = participantByUserId.get(m.sender_user_id)
            const thisDay = dayLabel(m.created_at, lang)
            const showDayDivider = thisDay !== lastDay
            lastDay = thisDay

            const isProposal = threadId && isProposalBody(m.body)
            const alreadyConfirmed = isProposal && messages.slice(i + 1).some((later) => later.sender_user_id === userId && isConfirmedBody(later.body))
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
                      {isMine ? t('youLabel', lang) : [sender?.full_name || t('someoneLabel', lang), sender?.role ? roleLabel(sender.role, lang) : ''].filter(Boolean).join(' · ')}
                    </p>
                    <div
                      className={
                        isMine
                          ? 'bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white rounded-2xl rounded-br-sm px-4 py-2.5'
                          : 'bg-white/5 border border-white/10 text-white rounded-2xl rounded-bl-sm px-4 py-2.5'
                      }
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
                      {translations[m.id]?.text && (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words mt-1.5 pt-1.5 border-t border-white/15 italic opacity-90">
                          {translations[m.id].text}
                        </p>
                      )}
                    </div>
                    {!isMine && (
                      <div className="flex items-center gap-3 mt-1">
                        {!translations[m.id]?.text && (
                          <button
                            onClick={() => handleTranslate(m.id, m.body)}
                            disabled={translations[m.id]?.loading}
                            className="text-white/40 hover:text-white/70 text-[11px] transition disabled:opacity-50"
                          >
                            {translations[m.id]?.loading ? t('translatingDots', lang) : translations[m.id]?.error ? translations[m.id]?.error : t('seeTranslationBtn', lang)}
                          </button>
                        )}
                        {reportedIds.has(m.id) ? (
                          <span className="text-white/30 text-[11px]">{t('reportSubmittedMsg', lang)}</span>
                        ) : (
                          <button
                            onClick={() => { setReportingMessageId(m.id); setReportError(null) }}
                            className="text-white/30 hover:text-red-400 text-[11px] transition"
                          >
                            {t('reportMessageBtn', lang)}
                          </button>
                        )}
                      </div>
                    )}
                    <p className={`text-[10px] text-white/50 mt-1 ${isMine ? 'text-right' : 'text-left'}`}>
                      {formatTimestamp(m.created_at)}
                      {isMine && ` · ✓ ${t('sentLabel', lang)}`}
                    </p>
                    {canConfirm && (
                      <button
                        onClick={() => handleConfirmSchedule(m.body)}
                        disabled={sending}
                        className="mt-1.5 text-[#12A5A9] text-xs font-semibold bg-[#12A5A9]/10 hover:bg-[#12A5A9]/15 rounded-full px-3 py-1.5 transition disabled:opacity-50"
                      >
                        ✓ {t('confirmThisTime', lang)}
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

      {reportingMessageId && (
        <form onSubmit={handleSubmitReport} className="bg-white/5 border border-white/10 rounded-xl p-3 mb-3 space-y-2">
          <p className="text-white text-sm font-medium">{t('reportMessageTitle', lang)}</p>
          <div>
            <label className="text-white/60 text-xs block mb-1">{t('reportReasonLabel', lang)}</label>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value as (typeof REPORT_REASONS)[number])}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#12A5A9] transition"
            >
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r} className="bg-[#0C1A2E]">{t(reportReasonLabelKey[r], lang)}</option>
              ))}
            </select>
          </div>
          <textarea
            value={reportNote}
            onChange={(e) => setReportNote(e.target.value)}
            placeholder={t('reportNotePlaceholder', lang)}
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition resize-none"
          />
          {reportError && <p className="text-red-400 text-xs">{reportError}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={reportSubmitting}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold rounded-lg px-3.5 py-2 disabled:opacity-50 transition"
            >
              {t('submitReportBtn', lang)}
            </button>
            <button type="button" onClick={() => setReportingMessageId(null)} className="text-white/60 hover:text-white text-xs transition">
              {t('cancel', lang)}
            </button>
          </div>
        </form>
      )}

      {threadId && !showStartJob && showSchedule && (
        <form onSubmit={handleSendSchedule} className="bg-white/5 border border-white/10 rounded-xl p-3 mb-3 space-y-2">
          <p className="text-white/50 text-xs font-medium">{t('proposeATimeChat', lang)}</p>
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
              {t('sendProposal', lang)}
            </button>
            <button type="button" onClick={() => setShowSchedule(false)} className="text-white/60 hover:text-white text-xs transition">
              {t('cancel', lang)}
            </button>
          </div>
        </form>
      )}

      {showAiDraftBtn && showAiDraft && (
        <div className="bg-[#12A5A9]/8 border border-[#12A5A9]/25 rounded-xl p-3 mb-3">
          <p className="text-white/50 text-xs font-medium mb-2">{t('aiDraftPickOne', lang)}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={drafting}
              onClick={() => draftMessage('late_rent')}
              className="text-xs font-semibold text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-lg px-3 py-1.5 hover:bg-[#12A5A9]/15 transition disabled:opacity-50"
            >
              {t('aiDraftLateRent', lang)}
            </button>
            <button
              type="button"
              disabled={drafting}
              onClick={() => draftMessage('access_notice')}
              className="text-xs font-semibold text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-lg px-3 py-1.5 hover:bg-[#12A5A9]/15 transition disabled:opacity-50"
            >
              {t('aiDraftAccessNotice', lang)}
            </button>
            <button
              type="button"
              disabled={drafting}
              onClick={() => draftMessage('renewal_offer')}
              className="text-xs font-semibold text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-lg px-3 py-1.5 hover:bg-[#12A5A9]/15 transition disabled:opacity-50"
            >
              {t('aiDraftRenewalOffer', lang)}
            </button>
            {drafting && <span className="text-white/40 text-xs">{t('aiDrafting', lang)}</span>}
          </div>
        </div>
      )}

      {!isBlocked && smartReplies.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pt-2">
          {smartReplies.map((reply, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setDraft(reply)}
              className="text-xs font-medium text-white/70 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 hover:bg-white/10 hover:text-white transition"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {isBlocked ? (
        <p className="text-white/40 text-sm text-center pt-3 border-t border-white/8">{t('blockedConversationMsg', lang)}</p>
      ) : (
      <form onSubmit={handleSend} className="flex items-center gap-2 pt-2 border-t border-white/8">
        {showAiDraftBtn && (
          <button
            type="button"
            onClick={() => setShowAiDraft((v) => !v)}
            aria-label={t('aiDraftBtnLabel', lang)}
            title={t('aiDraftBtnLabel', lang)}
            className={`shrink-0 w-11 h-11 rounded-xl border flex items-center justify-center transition text-sm font-bold ${
              showAiDraft ? 'bg-[#12A5A9]/20 border-[#12A5A9]/40 text-[#12A5A9]' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
            }`}
          >
            ✦
          </button>
        )}
        {threadId && showStartJob && (
          <button
            type="button"
            onClick={() => router.push(`/landlord/messages/${threadId}/new-job`)}
            aria-label={t('startAJob', lang)}
            title={t('startAJob', lang)}
            className="shrink-0 w-11 h-11 rounded-xl border bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-[#12A5A9]/40 flex items-center justify-center transition"
          >
            <WrenchIcon className="w-4.5 h-4.5" />
          </button>
        )}
        {threadId && !showStartJob && (
          <button
            type="button"
            onClick={() => setShowSchedule((v) => !v)}
            aria-label={t('proposeATimeChat', lang)}
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
          placeholder={t('messagePlaceholder', lang)}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
        />
        <RippleButton
          type="submit"
          disabled={sending || !draft.trim()}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-5 py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50 shrink-0"
        >
          {t('send', lang)}
        </RippleButton>
      </form>
      )}
    </div>
  )
}
