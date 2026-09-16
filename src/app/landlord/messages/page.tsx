'use client'

import { BottomTabBar } from '@/components/BottomTabBar'
import { MessagesInbox } from '@/components/MessagesInbox'
import { LANDLORD_TABS } from '@/lib/navTabs'

export default function LandlordMessagesPage() {
  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <span className="text-white font-semibold text-sm">Prophandld</span>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        <h1 className="text-2xl font-bold text-white mb-8">Messages</h1>
        <MessagesInbox basePath="/landlord" />
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
