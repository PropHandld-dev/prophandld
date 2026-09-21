'use client'

import { ChatPanel } from '@/components/ChatPanel'

// The job's conversation, right on the job page: person-to-person messages
// and the automatic updates ("✓ Schedule confirmed") share one history, and
// new messages appear live. The nav chat icon scrolls here.
export function JobChatCard({
  jobId,
  title,
  subtitle,
  onRead,
}: {
  jobId: string
  title: string
  subtitle?: string
  onRead?: () => void
}) {
  return (
    <section id="chat" className="scroll-mt-24 bg-white/3 border border-white/8 rounded-2xl p-5 mb-4">
      <div className="mb-4">
        <h3 className="text-white font-semibold">{title}</h3>
        {subtitle && <p className="text-white/50 text-xs mt-0.5">{subtitle}</p>}
      </div>
      <ChatPanel jobId={jobId} heightClassName="h-[26rem]" onRead={onRead} />
    </section>
  )
}

export function scrollToChat(e?: { preventDefault: () => void }) {
  e?.preventDefault()
  document.getElementById('chat')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
