'use client'

import Link from 'next/link'
import { MessageCircleIcon } from '@/components/icons'
import { UnreadDot } from '@/components/UnreadDot'
import { useUnreadMessages } from '@/lib/useUnreadMessages'

// Top of every dashboard: opens the Messages inbox (job chats and direct
// messages), with a dot when something is waiting.
export function MessagesButton({ role, userId }: { role: 'landlord' | 'renter' | 'contractor'; userId: string | null }) {
  const unread = useUnreadMessages(userId)
  return (
    <Link
      href={`/${role}/messages`}
      aria-label="Messages"
      className="relative w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/5 transition active:scale-[0.95] motion-reduce:active:scale-100"
    >
      <MessageCircleIcon className="w-5 h-5" />
      {unread && <UnreadDot className="absolute top-1 right-1" />}
    </Link>
  )
}
