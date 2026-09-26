'use client'

import Link from 'next/link'
import { MessageCircleIcon } from '@/components/icons'
import { UnreadDot } from '@/components/UnreadDot'
import { useUnreadMessages } from '@/lib/useUnreadMessages'
import { useLanguage, t } from '@/lib/i18n'

// Top of every dashboard: opens the Messages inbox (job chats and direct
// messages), with a dot when something is waiting. `data-tour="messages"`
// is what each dashboard's ProductTour step actually targets — it used to
// target `[aria-label="Messages"]` directly, which would have silently
// stopped highlighting this button the moment the label below was
// translated for Spanish. A stable, never-translated attribute is the
// correct anchor for that; the aria-label is free to be a real translation.
export function MessagesButton({ role, userId }: { role: 'landlord' | 'renter' | 'contractor'; userId: string | null }) {
  const lang = useLanguage()
  const unread = useUnreadMessages(userId)
  return (
    <Link
      href={`/${role}/messages`}
      aria-label={t('messagesLabel', lang)}
      data-tour="messages"
      className="relative w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/5 transition active:scale-[0.95] motion-reduce:active:scale-100"
    >
      <MessageCircleIcon className="w-5 h-5" />
      {unread && <UnreadDot className="absolute top-1 right-1" />}
    </Link>
  )
}
