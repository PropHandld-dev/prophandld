'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { TranslateLink } from '@/components/TranslateLink'

type Msg = {
  id: string
  mine: boolean
  senderSide: 'owner' | 'pm'
  senderName: string
  kind: 'text' | 'approval'
  body: string
  action: { type: 'job_payment' | 'general'; bidId?: string; jobId?: string; amount?: number | null; title: string } | null
  actionStatus: 'pending' | 'approved' | 'declined' | null
  decidedAt: string | null
  createdAt: string
}
type Thread = {
  side: 'owner' | 'pm'
  orgName: string
  ownerName: string
  logoUrl: string | null
  otherLastReadAt: string | null
  payableJobs?: { bidId: string; jobId: string; title: string; amount: number; overLimit: boolean; requested: boolean }[]
  messages: Msg[]
}

const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 === 0 ? 0 : 2 })
const time = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// The PM <-> owner conversation, replacing back-and-forth texts and calls:
// messages, one-tap approval cards, and AI drafting on both sides.
export function PmOwnerThread({ ownerId, onClose }: { ownerId?: string; onClose: () => void }) {
  const [thread, setThread] = useState<Thread | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [drafting, setDrafting] = useState<string | null>(null)
  const [deciding, setDeciding] = useState<string | null>(null)
  const [showApproval, setShowApproval] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const q = ownerId ? `?owner=${ownerId}` : ''

  const load = useCallback(async () => {
    const res = await fetch(`/api/pm/thread${q}`).catch(() => null)
    const d = res ? await res.json().catch(() => null) : null
    if (!res?.ok || !d) setError(d?.error || 'Could not load the conversation.')
    else {
      setError(null)
      setThread((prev) => {
        if (prev && prev.messages.length !== d.messages.length) setTimeout(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        return d
      })
    }
  }, [q])

  useEffect(() => {
    load().then(() => setTimeout(() => bottom.current?.scrollIntoView(), 50))
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, 8000)
    return () => clearInterval(t)
  }, [load])

  const send = async (payload: Record<string, unknown>) => {
    setSending(true)
    setError(null)
    const res = await fetch('/api/pm/thread', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: ownerId, ...payload }) }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setSending(false)
    if (!res?.ok) {
      setError(d.error || 'Could not send.')
      return false
    }
    await load()
    return true
  }

  const draft = async (mode: 'update' | 'reply' | 'polish') => {
    setDrafting(mode)
    setError(null)
    const res = await fetch('/api/pm/thread/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: ownerId, mode, draft: text }) }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setDrafting(null)
    if (!res?.ok) setError(d.error || 'Could not draft that.')
    else setText(d.text)
  }

  const remove = async (m: Msg) => {
    if (!window.confirm(m.kind === 'approval' ? 'Withdraw this approval request?' : 'Delete this message?')) return
    const res = await fetch(`/api/pm/thread/${m.id}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) setError((res ? (await res.json().catch(() => ({}))).error : null) || 'Could not delete.')
    await load()
  }

  const decide = async (messageId: string, decision: 'approved' | 'declined') => {
    setDeciding(messageId + decision)
    const res = await fetch('/api/pm/thread/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId, decision }) }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setDeciding(null)
    if (!res?.ok) setError(d.error || 'Could not save.')
    await load()
  }

  const other = thread ? (thread.side === 'owner' ? thread.orgName : thread.ownerName) : ''
  const lastMine = thread ? [...thread.messages].reverse().find((m) => m.mine) : null
  const seen = !!(lastMine && thread?.otherLastReadAt && thread.otherLastReadAt >= lastMine.createdAt)
  const hasIncoming = !!thread?.messages.some((m) => !m.mine)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-[#0F2138] border border-white/10 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-xl h-[92vh] sm:h-[80vh] flex flex-col overflow-hidden">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
          <div className="w-10 h-10 rounded-xl bg-[#12A5A9]/15 flex items-center justify-center overflow-hidden shrink-0 text-[#12A5A9] font-bold">
            {thread?.side === 'owner' && thread.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thread.logoUrl} alt="" className="w-full h-full object-cover bg-white" />
            ) : (
              (other || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold truncate">{other || 'Conversation'}</p>
            <p className="text-white/45 text-xs">{thread?.side === 'owner' ? 'Your property manager' : 'Your client'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-lg text-white/50 hover:text-white hover:bg-white/5 text-xl">×</button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {!thread && !error && <p className="text-white/40 text-sm text-center py-10">Loading…</p>}
          {thread && thread.messages.length === 0 && (
            <div className="text-center py-10 px-6">
              <p className="text-white font-semibold">Start the conversation</p>
              <p className="text-white/50 text-sm mt-1">
                {thread.side === 'pm'
                  ? `Updates, questions and approvals for ${thread.ownerName}, all in one place. Try "Draft update" for a ready-to-send summary.`
                  : `Message ${thread.orgName} here instead of texting or calling. Everything stays on record.`}
              </p>
            </div>
          )}
          {thread?.messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              {m.kind === 'approval' && m.action ? (
                <div className="w-full max-w-[88%] rounded-2xl border border-white/12 bg-white/5 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Approval request</span>
                    <span
                      className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                        m.actionStatus === 'approved' ? 'bg-[#12A5A9]/15 text-[#12A5A9]' : m.actionStatus === 'declined' ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'
                      }`}
                    >
                      {m.actionStatus === 'approved' ? 'Approved' : m.actionStatus === 'declined' ? 'Declined' : 'Waiting'}
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-white font-semibold">{m.action.title}</p>
                    {m.action.amount ? <p className="text-white text-2xl font-bold tabular-nums mt-1">{money(Number(m.action.amount))}</p> : null}
                    {m.body && m.body !== m.action.title && <p className="text-white/65 text-sm mt-2 whitespace-pre-line">{m.body}</p>}
                    {m.action.jobId && (
                      <Link href={`/landlord/jobs/${m.action.jobId}`} className="inline-block text-[#12A5A9] text-xs font-semibold mt-2 hover:underline">View job, bids and photos →</Link>
                    )}
                    {m.actionStatus === 'pending' && thread.side === 'owner' && (
                      <div className="grid grid-cols-2 gap-2 mt-4">
                        <button onClick={() => decide(m.id, 'approved')} disabled={!!deciding} className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50">
                          {deciding === m.id + 'approved' ? 'Approving…' : 'Approve'}
                        </button>
                        <button onClick={() => decide(m.id, 'declined')} disabled={!!deciding} className="bg-white/6 border border-white/12 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50">
                          {deciding === m.id + 'declined' ? 'Declining…' : 'Decline'}
                        </button>
                      </div>
                    )}
                    {m.actionStatus === 'approved' && thread.side === 'pm' && m.action.type === 'job_payment' && m.action.jobId && (
                      <Link href={`/landlord/jobs/${m.action.jobId}`} className="block text-center bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl mt-4">Pay this job now</Link>
                    )}
                  </div>
                  <p className="px-4 pb-3 text-white/35 text-[11px] flex items-center gap-2">
                    <span>{m.senderName} · {time(m.createdAt)}{m.decidedAt ? ` · decided ${time(m.decidedAt)}` : ''}</span>
                    {m.mine && m.actionStatus === 'pending' && (
                      <button onClick={() => remove(m)} className="ml-auto text-white/45 hover:text-red-400 font-semibold">Withdraw</button>
                    )}
                  </p>
                </div>
              ) : (
                <div className={`max-w-[80%] ${m.mine ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line leading-relaxed ${m.mine ? 'bg-[#12A5A9] text-white rounded-br-md' : 'bg-white/8 text-white rounded-bl-md'}`}>{m.body}</div>
                  <span className="text-white/35 text-[11px] mt-1 px-1">
                    {!m.mine && thread.side === 'owner' ? `${m.senderName} · ` : ''}{time(m.createdAt)}
                    {m.mine && <button onClick={() => remove(m)} className="ml-2 text-white/35 hover:text-red-400">Delete</button>}
                  </span>
                  {!m.mine && <TranslateLink text={m.body} className="px-1" />}
                </div>
              )}
            </div>
          ))}
          {seen && <p className="text-right text-white/35 text-[11px] -mt-2 px-1">Seen</p>}
          <div ref={bottom} />
        </div>

        {showApproval && thread?.side === 'pm' && (
          <ApprovalComposer
            jobs={thread.payableJobs || []}
            sending={sending}
            onCancel={() => setShowApproval(false)}
            onSend={async (payload) => { if (await send(payload)) setShowApproval(false) }}
          />
        )}

        <footer className="border-t border-white/8 p-3 space-y-2">
          {error && <p className="text-red-400 text-xs px-1">{error}</p>}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {thread?.side === 'pm' && (
              <>
                <button onClick={() => setShowApproval((v) => !v)} className="shrink-0 text-xs font-semibold text-white bg-white/6 border border-white/12 rounded-full px-3 py-1.5 hover:bg-white/10">Request approval</button>
                <button onClick={() => draft('update')} disabled={!!drafting} className="shrink-0 text-xs font-semibold text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/25 rounded-full px-3 py-1.5 disabled:opacity-50">✦ {drafting === 'update' ? 'Drafting…' : 'Draft update'}</button>
              </>
            )}
            {hasIncoming && (
              <button onClick={() => draft('reply')} disabled={!!drafting} className="shrink-0 text-xs font-semibold text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/25 rounded-full px-3 py-1.5 disabled:opacity-50">✦ {drafting === 'reply' ? 'Drafting…' : 'Draft reply'}</button>
            )}
            {text.trim().length > 10 && (
              <button onClick={() => draft('polish')} disabled={!!drafting} className="shrink-0 text-xs font-semibold text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/25 rounded-full px-3 py-1.5 disabled:opacity-50">✦ {drafting === 'polish' ? 'Polishing…' : 'Polish'}</button>
            )}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
                  e.preventDefault()
                  if (text.trim() && !sending) send({ body: text }).then((ok) => ok && setText(''))
                }
              }}
              rows={Math.min(5, Math.max(1, text.split('\n').length))}
              maxLength={4000}
              placeholder={`Message ${other || ''}`}
              aria-label="Message"
              className="flex-1 resize-none bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-white text-sm placeholder-white/35 focus:outline-none focus:border-[#12A5A9]"
            />
            <button
              onClick={() => send({ body: text }).then((ok) => ok && setText(''))}
              disabled={sending || !text.trim()}
              className="shrink-0 h-10 px-4 rounded-full bg-[#12A5A9] text-white text-sm font-semibold disabled:opacity-40"
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function ApprovalComposer({
  jobs,
  sending,
  onCancel,
  onSend,
}: {
  jobs: { bidId: string; jobId: string; title: string; amount: number; overLimit: boolean; requested: boolean }[]
  sending: boolean
  onCancel: () => void
  onSend: (payload: Record<string, unknown>) => void
}) {
  const open = jobs.filter((j) => !j.requested)
  const [choice, setChoice] = useState<string>(open[0]?.bidId || 'general')
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const input = 'w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-white/35 focus:outline-none focus:border-[#12A5A9]'
  return (
    <div className="border-t border-white/8 bg-white/3 p-4 space-y-2.5">
      <p className="text-white text-sm font-semibold">Ask for approval</p>
      <select aria-label="What needs approval" value={choice} onChange={(e) => setChoice(e.target.value)} className={input}>
        {open.map((j) => (
          <option key={j.bidId} value={j.bidId}>Pay {j.title} · {money(j.amount)}{j.overLimit ? ' (over their limit)' : ''}</option>
        ))}
        <option value="general">Something else…</option>
      </select>
      {choice === 'general' && (
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="e.g. Replace water heater" className={input} aria-label="What to approve" />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" inputMode="decimal" min={0} placeholder="$ optional" className={input} aria-label="Amount" />
        </div>
      )}
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Add a note (optional)" className={input} aria-label="Note" />
      <div className="flex items-center gap-3">
        <button
          onClick={() =>
            onSend(
              choice === 'general'
                ? { approval: { type: 'general', title, amount: amount || null }, body: note }
                : { approval: { type: 'job_payment', bidId: choice }, body: note }
            )
          }
          disabled={sending || (choice === 'general' && !title.trim())}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-40"
        >
          {sending ? 'Sending…' : 'Send for approval'}
        </button>
        <button onClick={onCancel} className="text-white/50 hover:text-white text-sm">Cancel</button>
      </div>
    </div>
  )
}
