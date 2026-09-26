'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChatPanel } from '@/components/ChatPanel'
import { useLanguage, t } from '@/lib/i18n'

export default function ContractorJobChatPage() {
  const params = useParams()
  const lang = useLanguage()
  const jobId = params.jobId as string

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href={`/contractor/jobs/${jobId}`} className="text-white/50 hover:text-white text-sm transition">
          {t('jobBack', lang)}
        </Link>
        <span className="text-white font-semibold text-sm">{t('messagesLabel', lang)}</span>
        <div className="w-12" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-6">
        <ChatPanel jobId={jobId} />
      </main>
    </div>
  )
}
