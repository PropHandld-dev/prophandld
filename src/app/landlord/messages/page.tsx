'use client'

import Link from 'next/link'
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
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Messages</h1>
          <Link
            href="/landlord/messages/new"
            className="text-xs font-semibold bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white px-3.5 py-2 rounded-full hover:opacity-90 transition"
          >
            New message
          </Link>
        </div>
        <MessagesInbox basePath="/landlord" />
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
