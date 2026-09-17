'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChatPanel } from '@/components/ChatPanel'

export default function RenterDmThreadPage() {
  const params = useParams()
  const threadId = params.threadId as string

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/renter/messages" className="text-white/50 hover:text-white text-sm transition">
          ← Messages
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <div className="w-16" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-6">
        <ChatPanel threadId={threadId} />
      </main>
    </div>
  )
}
