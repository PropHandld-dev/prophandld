'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChatPanel } from '@/components/ChatPanel'
import { popStashedDraft } from '@/lib/dmThreads'

export default function LandlordDmThreadPage() {
  const params = useParams()
  const threadId = params.threadId as string
  const [initialDraft] = useState(() => popStashedDraft(threadId))

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord/messages" className="text-white/50 hover:text-white text-sm transition">
          ← Messages
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-16" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-6">
        <ChatPanel threadId={threadId} initialDraft={initialDraft} />
      </main>
    </div>
  )
}
