'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChatPanel } from '@/components/ChatPanel'
import { NewConversationPicker, type StartedConversation } from '@/components/NewConversationPicker'

export default function ContractorNewMessagePage() {
  const router = useRouter()
  const [started, setStarted] = useState<StartedConversation | null>(null)

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/contractor/messages" className="text-white/50 hover:text-white text-sm transition">
          ← Messages
        </Link>
        <span className="text-white font-semibold text-sm">{started ? started.otherName : 'New message'}</span>
        <div className="w-16" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-6">
        {started ? (
          <ChatPanel threadId={started.threadId} initialDraft={started.initialDraft} />
        ) : (
          <div className="h-[70vh]">
            <NewConversationPicker myRole="contractor" onStart={setStarted} onCancel={() => router.replace('/contractor/messages')} />
          </div>
        )}
      </main>
    </div>
  )
}
