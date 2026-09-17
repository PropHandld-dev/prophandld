'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ScheduleCalendar, type CalendarEvent } from '@/components/ScheduleCalendar'
import { ScrollReveal } from '@/components/ScrollReveal'

export default function ContractorCalendarPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<CalendarEvent[]>([])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: bidsData } = await supabase
        .from('bids')
        .select('*, jobs(id, category, status, proposed_date, proposed_window, schedule_confirmed, units(unit_number, properties(address, city)))')
        .eq('contractor_user_id', user.id)

      const confirmed = (bidsData || []).filter(
        (b) => b.jobs?.status === 'scheduled' && b.jobs?.schedule_confirmed && b.jobs?.proposed_date
      )

      setEvents(
        confirmed.map((b) => ({
          id: b.jobs.id,
          date: b.jobs.proposed_date,
          window: b.jobs.proposed_window,
          title: b.jobs.category,
          subtitle: [b.jobs.units?.properties?.address, b.jobs.units?.unit_number].filter(Boolean).join(' · '),
          href: `/contractor/jobs/${b.jobs.id}`,
        }))
      )
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/contractor" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <Link href="/contractor" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Calendar</h1>
          <p className="text-white/50 text-sm mt-1">Your confirmed job schedules.</p>
        </div>

        <ScrollReveal>
          <ScheduleCalendar events={events} />
        </ScrollReveal>
      </main>
    </div>
  )
}
