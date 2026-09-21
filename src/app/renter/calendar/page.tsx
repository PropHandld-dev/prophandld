'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ScheduleCalendar, eventState, CALENDAR_JOB_STATUSES, calendarHistoryStart, type CalendarEvent } from '@/components/ScheduleCalendar'
import { ScrollReveal } from '@/components/ScrollReveal'
import { timeWindowLabel } from '@/lib/constants'

export default function RenterCalendarPage() {
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

      // Resolves to the household lease for the primary tenant and for a
      // co-renter alike (the co-renter's calendar used to be empty).
      const { data: tenancyId } = await supabase.rpc('get_my_active_tenancy_id')
      const { data: tenancyData } = tenancyId
        ? await supabase.from('tenancies').select('unit_id').eq('id', tenancyId).maybeSingle()
        : { data: null }

      if (!tenancyData) {
        setLoading(false)
        return
      }

      const { data: confirmedJobs } = await supabase
        .from('jobs')
        .select('*')
        .eq('unit_id', tenancyData.unit_id)
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
            subtitle: job.proposed_window ? timeWindowLabel(job.proposed_window) : undefined,
            href: `/renter/jobs/${job.id}`,
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
        <Link href="/renter" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <Link href="/renter" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Calendar</h1>
          <p className="text-white/50 text-sm mt-1">Confirmed appointments for your home.</p>
        </div>

        <ScrollReveal>
          <ScheduleCalendar events={events} />
        </ScrollReveal>
      </main>
    </div>
  )
}
