'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useConversations } from '@/lib/useConversations'
import { ChatPanel } from '@/components/ChatPanel'
import { NewConversationPicker, type StartedConversation } from '@/components/NewConversationPicker'
import { DmContactsStrip } from '@/components/DmContactsStrip'
import { MessageCircleIcon } from '@/components/icons'

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  const isToday = date.toDateString() === new Date().toDateString()
  if (isToday) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

type ActivePanel =
  | { kind: 'job'; id: string; otherName: string; otherRole: string; category: string }
  | { kind: 'dm'; id: string; otherName: string; otherRole: string; initialDraft?: string }

export function FloatingChatWidget() {
  const pathname = usePathname()
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<'landlord' | 'renter' | 'contractor' | null>(null)
  const [open, setOpen] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [active, setActive] = useState<ActivePanel | null>(null)

  useEffect(() => {
    const applyUser = (user: { id: string; user_metadata?: { role?: string } } | null | undefined) => {
      setUserId(user?.id ?? null)
      const r = user?.user_metadata?.role
      setRole(r === 'landlord' || r === 'renter' || r === 'contractor' ? r : null)
    }
    supabase.auth.getUser().then(({ data: { user } }) => applyUser(user))
    // Right after sign-in the session can still be settling when this
    // mounts, so getUser() alone can miss it — also react to auth state
    // changes so the icon appears as soon as the session is ready,
    // without needing a manual refresh.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user)
    })
    return () => subscription.unsubscribe()
  }, [])

  const { loading, conversations, unreadIds, totalUnread, refetch } = useConversations(userId)

  // Skip on the pages that already show conversations full-screen —
  // a floating bubble on top of the full chat/inbox view would be
  // redundant clutter, not a shortcut.
  const isChatOrInboxPage = /\/jobs\/[^/]+\/chat$/.test(pathname) || /\/messages(\/|$)/.test(pathname)

  if (!userId || !role || isChatOrInboxPage) return null

  const handleClose = () => {
    setOpen(false)
    setActive(null)
    setShowPicker(false)
  }

  const openConversation = (c: (typeof conversations)[number]) => {
    setActive({ kind: c.kind, id: c.id, otherName: c.otherName, otherRole: c.otherRole, category: c.category })
  }

  const handleStarted = (c: StartedConversation) => {
    setShowPicker(false)
    setActive({ kind: 'dm', id: c.threadId, otherName: c.otherName, otherRole: c.otherRole, initialDraft: c.initialDraft })
  }

  const handleBackToList = () => {
    setActive(null)
    // Don't rely solely on the realtime subscription catching up — a
    // conversation just started via the picker/strip has no messages
    // yet, and the freshly-sent one should show up immediately rather
    // than waiting on a delayed postgres_changes event.
    refetch()
  }

  const handleToggleOpen = () => {
    setOpen((v) => {
      if (!v) refetch()
      return !v
    })
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-x-4 bottom-24 sm:inset-x-auto sm:right-5 sm:w-96 z-50 motion-safe:animate-[floatUp_0.25s_ease-out]"
          style={{ transformOrigin: 'bottom right' }}
        >
          <div className="bg-[#0F2138]/97 backdrop-blur-xl border border-white/10 rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col h-[70vh] sm:h-[520px]">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/8 shrink-0">
              {active ? (
                <>
                  <button onClick={handleBackToList} className="text-white/50 hover:text-white transition shrink-0">
                    ←
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-semibold truncate">{active.otherName}</p>
                    <p className="text-white/40 text-xs truncate">
                      {active.otherRole}{active.kind === 'job' ? ` · ${active.category}` : ''}
                    </p>
                  </div>
                </>
              ) : showPicker ? (
                <p className="text-white text-sm font-semibold flex-1">New message</p>
              ) : (
                <>
                  <p className="text-white text-sm font-semibold flex-1">Messages</p>
                  <button
                    onClick={() => setShowPicker(true)}
                    className="text-white/50 hover:text-white text-lg leading-none transition shrink-0 w-6 h-6 flex items-center justify-center"
                    aria-label="New message"
                  >
                    +
                  </button>
                </>
              )}
              <button onClick={handleClose} className="text-white/40 hover:text-white text-lg leading-none transition shrink-0">
                ×
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              {active ? (
                <div className="px-4 h-full">
                  <ChatPanel
                    {...(active.kind === 'job' ? { jobId: active.id } : { threadId: active.id, initialDraft: active.initialDraft })}
                    heightClassName="h-full"
                    onRead={refetch}
                  />
                </div>
              ) : showPicker ? (
                <NewConversationPicker myRole={role} onStart={handleStarted} onCancel={() => setShowPicker(false)} />
              ) : (
                <div className="h-full overflow-y-auto px-3 py-3">
                  <DmContactsStrip myRole={role} onStart={handleStarted} onSeeAll={() => setShowPicker(true)} />
                  {loading ? (
                    <div className="space-y-2">
                      <div className="h-16 bg-white/5 rounded-xl animate-pulse" />
                      <div className="h-16 bg-white/5 rounded-xl animate-pulse" />
                    </div>
                  ) : conversations.length === 0 ? (
                    <p className="text-white/30 text-sm text-center py-10">No conversations yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {conversations.map((c) => {
                        const isMine = c.lastSenderId === userId
                        const isUnread = unreadIds.has(`${c.kind}:${c.id}`)
                        return (
                          <button
                            key={`${c.kind}:${c.id}`}
                            onClick={() => openConversation(c)}
                            className="w-full text-left bg-white/5 hover:bg-white/8 rounded-xl p-3 transition"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-white text-sm font-medium truncate">{c.otherName}</p>
                                  {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-[#12A5A9] shrink-0" />}
                                </div>
                                <p className="text-white/50 text-xs truncate mt-0.5">
                                  {isMine ? 'You: ' : ''}{c.lastMessage}
                                </p>
                              </div>
                              <span className="text-white/30 text-[10px] shrink-0">{formatTimestamp(c.lastMessageAt)}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!active && !showPicker && (
              <Link
                href={`/${role}/messages`}
                onClick={handleClose}
                className="block text-center text-[#12A5A9] text-xs font-semibold py-2.5 border-t border-white/8 hover:bg-white/5 transition shrink-0"
              >
                View full inbox
              </Link>
            )}
          </div>
        </div>
      )}

      {!open && (
        <button
          onClick={handleToggleOpen}
          className="fixed bottom-24 right-5 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] shadow-[0_10px_30px_-8px_rgba(18,165,169,0.6)] flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform motion-safe:animate-[floatUp_0.3s_ease-out]"
          aria-label="Messages"
        >
          <MessageCircleIcon className="w-6 h-6" />
          {totalUnread > 0 && (
            <>
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
              <span className="absolute inset-0 rounded-full motion-safe:animate-[bubblePulse_2.5s_ease-out_infinite]" />
            </>
          )}
        </button>
      )}
    </>
  )
}
