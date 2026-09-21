'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ScheduleCalendar, eventState, CALENDAR_JOB_STATUSES, calendarHistoryStart, type CalendarEvent } from '@/components/ScheduleCalendar'
import { ScrollReveal } from '@/components/ScrollReveal'

export default function LandlordCalendarPage() {
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

      const { data: propertiesData } = await supabase
        .from('properties')
        .select('id')
        .eq('owner_user_id', user.id)
        .eq('archived', false)

      const propertyIds = (propertiesData || []).map((p) => p.id)
      if (propertyIds.length === 0) {
        setLoading(false)
        return
      }

      const { data: unitsData } = await supabase
        .from('units')
        .select('id')
        .in('property_id', propertyIds)

      const unitIds = (unitsData || []).map((u) => u.id)
      if (unitIds.length === 0) {
        setLoading(false)
        return
      }

      // Confirmed times, times still waiting for confirmation (which is also
      // what a reschedule looks like until it is accepted), and finished jobs
      // from the last year as a history.
      const { data: confirmedJobs } = await supabase
        .from('jobs')
        .select('*, units(unit_number, properties(address, city))')
        .in('unit_id', unitIds)
        .in('status', CALENDAR_JOB_STATUSES)
        .not('proposed_date', 'is', null)
        .gte('proposed_date', calendarHistoryStart())

      setEvents(
        (confirmedJobs || [])
          .filter((job) => job.proposed_date)
          .map((job) => ({
            id: job.id,
            date: job.proposed_date,
            window: job.proposed_window,
            title: job.category,
            subtitle: [job.units?.properties?.address, job.units?.unit_number].filter(Boolean).join(' · '),
            href: `/landlord/jobs/${job.id}`,
            state: eventState(job.status, job.schedule_confirmed === true),
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
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Calendar</h1>
          <p className="text-white/50 text-sm mt-1">Confirmed times, times waiting for a reply, and finished jobs across your portfolio.</p>
        </div>

        <ScrollReveal>
          <ScheduleCalendar events={events} />
        </ScrollReveal>
      </main>
    </div>
  )
}
