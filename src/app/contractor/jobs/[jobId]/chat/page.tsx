'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChatPanel } from '@/components/ChatPanel'

export default function ContractorJobChatPage() {
  const params = useParams()
  const jobId = params.jobId as string

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href={`/contractor/jobs/${jobId}`} className="text-white/50 hover:text-white text-sm transition">
          ← Job
        </Link>
        <span className="text-white font-semibold text-sm">Messages</span>
        <div className="w-12" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-6">
        <ChatPanel jobId={jobId} />
      </main>
    </div>
  )
}
