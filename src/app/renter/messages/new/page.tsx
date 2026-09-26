'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChatPanel } from '@/components/ChatPanel'
import { NewConversationPicker, type StartedConversation } from '@/components/NewConversationPicker'
import { useLanguage, t } from '@/lib/i18n'

export default function RenterNewMessagePage() {
  const router = useRouter()
  const lang = useLanguage()
  const [started, setStarted] = useState<StartedConversation | null>(null)

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/renter/messages" className="text-white/50 hover:text-white text-sm transition">
          {t('backToMessages', lang)}
        </Link>
        <span className="text-white font-semibold text-sm">{started ? started.otherName : t('newMessage', lang)}</span>
        <div className="w-16" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-6">
        {started ? (
          <ChatPanel threadId={started.threadId} initialDraft={started.initialDraft} />
        ) : (
          <div className="h-[70vh]">
            <NewConversationPicker myRole="renter" onStart={setStarted} onCancel={() => router.replace('/renter/messages')} />
          </div>
        )}
      </main>
    </div>
  )
}
