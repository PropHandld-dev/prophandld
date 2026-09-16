'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Skeleton } from '@/components/Skeleton'
import { RippleButton } from '@/components/RippleButton'

type Message = {
  id: string
  job_id: string
  sender_user_id: string
  body: string
  created_at: string
  sender?: { full_name: string | null }
}

export function ChatPanel({ jobId }: { jobId: string }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const enrichSenderNames = async (rows: Message[]) => {
    const senderIds = Array.from(new Set(rows.map((m) => m.sender_user_id)))
    if (senderIds.length === 0) return rows
    const { data: users } = await supabase.from('users').select('id, full_name').in('id', senderIds)
    const nameById = new Map((users || []).map((u) => [u.id, u.full_name]))
    return rows.map((m) => ({ ...m, sender: { full_name: nameById.get(m.sender_user_id) || null } }))
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data, error: loadError } = await supabase
        .from('messages')
        .select('id, job_id, sender_user_id, body, created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true })

      if (loadError) {
        console.error('Error loading messages:', loadError)
        setError('Could not load messages.')
        setLoading(false)
        return
      }

      setMessages(await enrichSenderNames(data || []))
      setLoading(false)
    }
    init()

    const channel = supabase
      .channel(`messages:${jobId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `job_id=eq.${jobId}` },
        async (payload) => {
          const [enriched] = await enrichSenderNames([payload.new as Message])
          setMessages((prev) => (prev.some((m) => m.id === enriched.id) ? prev : [...prev, enriched]))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [jobId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.trim() || !userId) return

    setSending(true)
    setError(null)

    const { error: insertError } = await supabase.from('messages').insert({
      job_id: jobId,
      sender_user_id: userId,
      body: draft.trim(),
    })

    if (insertError) {
      console.error('Error sending message:', insertError)
      setError('Could not send message.')
      setSending(false)
      return
    }

    setDraft('')
    setSending(false)
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-14" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[70vh]">
      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
        {messages.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-10">No messages yet — say hello.</p>
        ) : (
          messages.map((m) => {
            const isMine = m.sender_user_id === userId
            return (
              <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={
                    isMine
                      ? 'max-w-[75%] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white rounded-2xl rounded-br-sm px-4 py-2.5'
                      : 'max-w-[75%] bg-white/5 border border-white/10 text-white rounded-2xl rounded-bl-sm px-4 py-2.5'
                  }
                >
                  {!isMine && (
                    <p className="text-white/40 text-[10px] font-semibold mb-0.5">{m.sender?.full_name || 'Someone'}</p>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`text-[10px] mt-1 ${isMine ? 'text-white/70' : 'text-white/30'}`}>
                    {new Date(m.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </p>
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

      <form onSubmit={handleSend} className="flex items-center gap-2 pt-2 border-t border-white/8">
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
